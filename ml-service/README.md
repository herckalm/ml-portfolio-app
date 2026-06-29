# ML Service

Model-inference layer for the **ML Portfolio** application. A FastAPI service that
loads exported model artifacts and serves predictions to the backend over the
private network.

> **Status: early scaffold.** Today this service exposes a liveness probe and
> nothing else — no model loads and no inference route exists yet. This README
> documents the **target architecture** (the shape the scaffold is being built
> toward) alongside what currently exists; each section marks which is which. The
> system-level integration decision lives in [`../backend/ARCHITECTURE.md`](../backend/ARCHITECTURE.md) §9.

---

## Technology stack

| Technology  | Role                             | Status  |
| ----------- | -------------------------------- | ------- |
| FastAPI     | Web framework, routing           | in use  |
| Uvicorn     | ASGI server                      | in use  |
| uv          | Dependency resolution + venv     | in use  |
| onnxruntime | ONNX inference (predictor #1)    | planned |
| tokenizers  | HF fast tokenizer (predictor #1) | planned |
| numpy       | Array ops on model I/O           | planned |

The inference dependencies are deliberately **light**: serving the exported ONNX
artifact needs `onnxruntime` + `tokenizers` + `numpy`, with no `torch` or
`transformers` in the runtime image.

---

## Architecture at a glance

The service is a **pluggable predictor host**, not a single-model server. A
registry maps a `model_id` to a _predictor_, and one uniform envelope wraps every
result regardless of which model produced it:

```
POST /v1/models/{model_id}/predict
        │
        ▼
   Registry ........ model_id → Predictor (lazy-loaded)
        │
        ▼
   Predictor ....... load() / predict() / health()   ← behavioral Protocol
        │
        ▼
   Envelope ........ { model_id, model_version, result, meta }
```

The service sits **behind the backend** — the browser never calls it directly.
The backend owns authentication, rate-limiting, and translating this service's
errors into the API's RFC 7807 envelope. See `ARCHITECTURE.md` §9 for the full
integration boundary.

### The predictor contract

Every model implements the same **behavioral `Protocol`** — structural typing, no
base class, so the service never imports a concrete model class:

```python
from typing import Protocol, runtime_checkable, TypedDict, Any


class HealthInfo(TypedDict):
    model_loaded: bool          # False until load() succeeds
    model_version: str | None
    kind: str                   # "onnx" | "sklearn" | "external-api" | ...


@runtime_checkable
class Predictor(Protocol):
    """Behavioral contract every model in the host implements.

    A class is a Predictor if it has these methods with compatible
    signatures — it does not inherit from anything. Each model project
    supplies its own implementation; the service depends only on this shape.
    """

    def load(self, artifact_dir: str) -> None:
        """Construct the model from its artifact bundle.

        Must be safe to call when the bundle is absent: on failure, leave the
        predictor un-ready rather than raising. The readiness gate depends on
        this — a missing artifact must not crash the process.
        """
        ...

    def health(self) -> HealthInfo:
        """Report readiness. `model_loaded` is False until `load()` succeeds."""
        ...

    def predict(self, payload: Any) -> Any:
        """Synchronous inference. Input/output types are project-specific;
        the service wraps the return value in the response envelope.
        """
        ...

    # Streaming models (the generative project) additionally implement:
    # def predict_stream(self, payload: Any) -> Iterator[str]: ...
```

### Why a Protocol, not a fixed schema

Four model projects will plug into this host, and they vary on the axes that
would otherwise force a rewrite. The Protocol fixes the **envelope and lifecycle**
and leaves the per-model `result` open:

| Axis            | NLP / BERT             | CV image             | Clustering          | Generative¹         |
| --------------- | ---------------------- | -------------------- | ------------------- | ------------------- |
| Input transport | JSON text              | binary / multipart   | JSON vector         | JSON prompt         |
| Preprocessing   | clean + tokenize       | resize / normalize   | feature scale       | prompt template     |
| Result shape    | `{label, score, band}` | `{label, score}`     | `{cluster_id, ...}` | freeform text       |
| Calibration     | yes (T≈1.5)            | maybe                | n/a                 | n/a                 |
| Artifact        | ONNX bundle            | ONNX (likely)        | joblib (small)      | templates + API key |
| Sync vs. stream | sync                   | sync                 | sync                | **streaming**       |
| `model_loaded`  | bundle constructible   | bundle constructible | pickle loaded       | API key + reachable |

¹ The generative project is **prompt-engineering over an external LLM API** — it
hosts no weights. Its "artifact" is a set of prompt templates, `model_loaded`
means the API key is present and the provider is reachable, and it streams via
`predict_stream`.

Three axes are the ones that would break a naive design: transport isn't always
JSON (CV), the result isn't always `{label, score}` (clustering, generative), and
one model streams (generative). The Protocol absorbs all three; everything else
is project-local.

---

## Project structure

Current scaffold:

```
ml-service/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app + root route
│   └── routers/
│       ├── __init__.py
│       └── health.py        # liveness probe
├── Dockerfile               # multi-stage uv build, non-root runtime
├── pyproject.toml
├── uv.lock
└── README.md
```

Target layout (planned modules in **bold**):

```
app/
├── main.py
├── **registry.py**          # model_id → Predictor, lazy loading
├── **schemas.py**           # request models + response envelope (Pydantic)
├── **cleaning.py**          # vendored from ml-portfolio-models (frozen contract)
├── **predictors/**          # one module per model, each implements Predictor
│   └── **distilbert.py**    # predictor #1
└── routers/
    ├── health.py
    └── **predict.py**       # POST /v1/models/{model_id}/predict
```

---

## Getting started

### Prerequisites

- Python 3.12
- [uv](https://docs.astral.sh/uv/)

### Install & run (local)

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### Run (Docker)

```bash
docker build -t ml-service .
docker run -p 8000:8000 ml-service
```

### Verify

```bash
curl localhost:8000/health
# {"status":"healthy"}
```

### Artifact mounting (planned)

The model bundle lives in the separate `ml-portfolio-models` repo, is gitignored,
and is ~268 MB — it **never travels through git** into this repo. It is mounted
into the container at runtime:

```bash
docker run -p 8000:8000 \
  -v /path/to/export:/artifacts/distilbert-cfpb \
  -e ARTIFACTS_DIR=/artifacts \
  ml-service
```

With no artifact mounted, the service still starts and serves demo mode (see
below). Object-store pull (versioned, checksum-verified) is the production target.

---

## API endpoints

### Current

| Method | Endpoint  | Description                                        |
| ------ | --------- | -------------------------------------------------- |
| GET    | `/`       | Service identity + liveness                        |
| GET    | `/health` | Liveness probe — the process is up (Docker target) |

### Planned

| Method | Endpoint                        | Description                                  |
| ------ | ------------------------------- | -------------------------------------------- |
| GET    | `/health/ready`                 | Readiness — reports `model_loaded` per model |
| POST   | `/v1/models/{model_id}/predict` | Inference; result wrapped in the envelope    |

**Response envelope** (all models):

```json
{
  "model_id": "distilbert-cfpb",
  "model_version": "1.0.0",
  "result": { "...": "model-specific" },
  "meta": { "demo_mode": false }
}
```

**Predictor #1 — DistilBERT** request and `result`:

```json
// request
{ "text": "My credit card was charged twice for the same transaction." }

// result
{ "label": "credit_card", "score": 0.94, "calibrated": true, "confidence_band": "high" }
```

The frontend renders `confidence_band` (`"high"` / `"low"`), **never the raw
score** — a low-confidence prediction surfaces as "please review," not a
misleading percentage. The calibration threshold is owned by the service (from the
artifact's `calibration.json`), not the caller.

**Error behavior:**

- Inputs below the cleaning contract's `MIN_CHARS` floor → `422`.
- When a model isn't loaded → `503` from this service; the backend proxy converts
  that into a `200` demo-mode envelope (`meta.demo_mode = true`) so the product
  degrades gracefully rather than erroring. This service emits FastAPI-native
  error responses; shaping them into the API's RFC 7807 envelope is the backend's
  job.

---

## Key design decisions

**Pluggable predictor host.** The service loads predictors behind a stable
`Protocol` and routes by `model_id` — adding a model is adding a predictor module
and a registry entry, not changing the service. BERT is predictor #1, not the
shape of the service.

**Proxied and internal.** Never browser-facing. There is **no CORS config** here
on purpose — the proxy edge owns browser concerns, consistent with how the
frontend is served same-origin and the backend scopes CORS.

**Stateless.** Holds no application data. Prediction logging and persistence, if
added, belong to the backend, which already owns the database, auth, and request
context. (The scaffold's original `asyncpg` / `/health/db` probe was template
residue and has been removed.)

**Light inference footprint.** Serves ONNX via `onnxruntime`; `torch` and
`transformers` stay out of the runtime path.

**Calibration-aware responses.** The service surfaces a calibrated confidence
_band_, not a raw probability, because the model's score is only trustworthy at
the high end.

**Vendored input cleaning.** The model was trained on text run through a fixed
cleaning contract (Unicode normalization, control-char stripping, whitespace
collapse) with a `MIN_CHARS` floor. The service vendors that same cleaning —
**copied** from the research repo, not imported — so a visitor pasting raw text
can't bypass it and skew the input distribution.

**Fail-fast on config, graceful-degrade on the artifact.** Like the backend, the
service is fail-fast on configuration. Unlike it, a **missing model artifact must
not stop the boot** — the process stays up and reports `model_loaded = false`, so
the readiness gate and demo mode work. This is deliberate, not an inconsistency.

---

## What to change before deploying

1. **Artifact delivery** — move from a local volume mount to a versioned,
   checksum-verified object-store pull.
2. **Network policy / service auth** — the service must remain unreachable from
   the public internet; only the backend should reach it (private network or a
   service token).
3. **`ARTIFACTS_DIR`** — point at where the bundle is mounted in the target
   environment.

---

## Future work

- **The inference path itself** — registry, predictor, response schema, cleaning
  module, and the `/v1/models/{id}/predict` + `/health/ready` routes. None exist
  yet; the scaffold is health-only.
- **Predictor #1 (DistilBERT)** — wire the exported ONNX bundle to the Protocol.
- **Predictors #2–#4** — CV (image classification), clustering, and the external
  LLM generative project, each landing as another predictor against the same host.
