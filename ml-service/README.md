# ML Service

Model-inference layer for the **ML Portfolio** application. A FastAPI service that
loads exported model artifacts and serves predictions to the backend over the
private network.

> **Status: inference path live (predictor #1).** The service exposes liveness,
> readiness, and the inference route, with the DistilBERT CFPB classifier wired
> as predictor #1 behind the registry. The artifact arrives via an object-store
> pull (MinIO in Compose); inference is artifact-gated, so when the pull finds
> nothing the process still boots and serves demo mode. Predictors #2–#4 remain
> planned. This README documents the current shape alongside the target
> architecture; each section marks which is which. The system-level integration
> decision lives in [`../backend/ARCHITECTURE.md`](../backend/ARCHITECTURE.md) §9.

---

## Technology stack

| Technology  | Role                             | Status |
| ----------- | -------------------------------- | ------ |
| FastAPI     | Web framework, routing           | in use |
| Uvicorn     | ASGI server                      | in use |
| uv          | Dependency resolution + venv     | in use |
| onnxruntime | ONNX inference (predictor #1)    | in use |
| tokenizers  | HF fast tokenizer (predictor #1) | in use |
| numpy       | Array ops on model I/O           | in use |

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
   Predictor ....... load() / predict() + model_loaded   ← behavioral Protocol
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
base class, so the service never imports a concrete model class. A predictor
exposes three read-only properties and two methods:

```python
from typing import Protocol, runtime_checkable

from app.schemas import PredictionResult


@runtime_checkable
class Predictor(Protocol):
    """Behavioral contract every model in the host implements.

    A class is a Predictor if it has these members with compatible
    signatures — it does not inherit from anything. Each model project
    supplies its own implementation; the service depends only on this shape.
    """

    @property
    def model_id(self) -> str: ...

    @property
    def model_version(self) -> str: ...

    @property
    def model_loaded(self) -> bool:
        """False until load() succeeds; gates readiness and demo mode."""
        ...

    def load(self) -> None:
        """Lazily construct the model from its artifact bundle.

        The artifact directory is supplied at construction time (the registry
        builds each predictor with its resolved path), so load() takes no
        argument. Must be safe when the bundle is absent: on a missing artifact,
        leave the predictor un-ready rather than raising — a missing artifact
        must not crash the process.
        """
        ...

    def predict(self, text: str) -> PredictionResult:
        """Synchronous inference. The result type is project-specific; the
        service wraps the return value in the response envelope. The router
        guarantees model_loaded is True before calling this.
        """
        ...

    # Streaming models (the generative project) will additionally implement:
    # def predict_stream(self, text: str) -> Iterator[str]: ...
```

Readiness is read directly from `model_loaded` (and `model_version`) per model;
the registry constructs predictors lazily and caches them. A future enhancement
may add a `kind` discriminator (`"onnx" | "sklearn" | "external-api" | ...`) to
the readiness payload so operators can see each predictor's type at a glance;
it is not implemented today.

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

```
ml-service/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app + root route
│   ├── registry.py          # model_id → Predictor, lazy loading
│   ├── schemas.py           # request models + response envelope (Pydantic)
│   ├── cleaning.py          # vendored from ml-portfolio-models (frozen contract)
│   ├── predictors/
│   │   ├── __init__.py      # the Predictor Protocol
│   │   └── distilbert.py    # predictor #1 (DistilBERT CFPB, ONNX)
│   └── routers/
│       ├── __init__.py
│       ├── health.py        # liveness + readiness
│       └── predict.py       # POST /v1/models/{model_id}/predict
├── tests/                   # cleaning unit tests + API contract tests
├── Dockerfile               # multi-stage uv build, non-root runtime
├── pyproject.toml
├── uv.lock
└── README.md
```

Planned modules (predictors #2–#4) land as additional files under
`app/predictors/`, each implementing the same `Predictor` Protocol plus a one-row
registry entry — no change to the service shape.

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

### Test & lint

```bash
uv run pytest          # cleaning unit tests + API contract tests
uvx ruff check .
```

The live-inference test is skipped automatically unless the DistilBERT bundle is
present at the resolved artifacts path; the contract tests (404/422/503,
readiness, envelope) run without any artifact.

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

### Artifact delivery

The model bundle lives in the separate `ml-portfolio-models` repo, is gitignored,
and is ~268 MB — it **never travels through git** into this repo. Two paths get it
into the container; the registry reads it the same way either way, resolving each
model to `${ARTIFACTS_DIR}/<relative_path>` (default `/app/artifacts`, predictor #1
at `nlp/distilbert-cfpb`) so the public `model_id` stays decoupled from the
on-disk layout.

**Object-store pull (the committed path).** Under Docker Compose the stack runs a
MinIO (S3-compatible) object store and a one-shot `mc` init container
(`artifact-init`) that pulls the bundle into a shared `ml_artifacts` volume before
this service boots, then verifies it with `sha256sum -c`. The bundle is versioned
by bucket path (`nlp/distilbert-cfpb/<version>/`, `<version>` matching the
artifact's `calibration.json` `model_version`). Seed the bucket once from the
local export, then bring up the stack:

```bash
# 1) start the store  2) seed it once (profile-gated)  3) bring up the stack
docker compose up -d minio
docker compose --profile seed run --rm minio-seed
docker compose up -d
```

`ARTIFACT_SOURCE_DIR` (in `.env`) points `minio-seed` at the local export;
`ARTIFACT_BUCKET` and `ARTIFACT_VERSION` name the bucket and version. If the
versioned prefix is absent, `artifact-init` writes nothing and the service falls
back to demo mode. In a real deployment, swap MinIO for cloud object storage
(S3/R2) by repointing the `mc` alias and credentials — the pull is unchanged.

**Direct volume mount (local override / standalone container).** For a quick local
run without the object store, mount the export straight to the expected path:

```bash
docker run -p 8000:8000 \
  -v /path/to/export:/app/artifacts/nlp/distilbert-cfpb \
  ml-service
```

With neither path providing an artifact, the service still starts and serves demo
mode (see below).

---

## API endpoints

### Current

| Method | Endpoint                        | Description                                        |
| ------ | ------------------------------- | -------------------------------------------------- |
| GET    | `/`                             | Service identity + liveness                        |
| GET    | `/health`                       | Liveness probe — the process is up (Docker target) |
| GET    | `/health/ready`                 | Readiness — reports `model_loaded` per model       |
| POST   | `/v1/models/{model_id}/predict` | Inference; result wrapped in the envelope          |

### Planned

| Method | Endpoint                               | Description                              |
| ------ | -------------------------------------- | ---------------------------------------- |
| POST   | `/v1/models/{model_id}/predict_stream` | Streaming inference (generative project) |

**Readiness** (`GET /health/ready`) is informational and always returns `200`;
it reports `model_loaded` and `model_version` per registered model so operators
can see which artifacts are loaded. The per-request `503` on `/predict` is what
actually gates demo mode.

**Response envelope** (all models):

```json
{
  "model_id": "distilbert-cfpb",
  "model_version": "1.0.0",
  "result": { "...": "model-specific" },
  "meta": { "demo_mode": false, "input_chars": 57 }
}
```

**Predictor #1 — DistilBERT** request and `result`:

```json
// request
{ "text": "My credit card was charged twice for the same transaction." }

// result
{ "label": "Credit card", "score": 0.94, "calibrated": true, "confidence_band": "high" }
```

Labels are the artifact's own class names (`config.json` `id2label`): `Credit
reporting`, `Debt collection`, `Mortgage`, `Credit card`, `Checking or savings
account`. The frontend renders `confidence_band` (`"high"` / `"low"`), **never the
raw score** — a low-confidence prediction surfaces as "please review," not a
misleading percentage. The score is temperature-calibrated (T≈1.5, from the
artifact's `calibration.json`); the band threshold is owned by the service
(default `0.75`, overridable via an optional `band_threshold` in
`calibration.json`), not the caller.

**Error behavior:**

- Inputs below the cleaning contract's `MIN_CHARS` floor (checked on the cleaned
  text) → `422`.
- Unknown `model_id` → `404`.
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
the high end. Logits are divided by the artifact's temperature before softmax
(Guo et al., 2017), which recalibrates the score without changing the predicted
label.

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

1. **Artifact store** — the object-store pull is built against MinIO in Compose;
   for a real deploy, repoint the `mc` alias/credentials at managed object storage
   (S3/R2) and host the versioned, checksum-verified bundle there.
2. **Network policy / service auth** — the service must remain unreachable from
   the public internet; only the backend should reach it (private network or a
   service token).
3. **`ARTIFACTS_DIR`** — point at where the bundle is mounted in the target
   environment.

---

## Future work

- **Predictors #2–#4** — CV (image classification), clustering, and the external
  LLM generative project, each landing as another predictor against the same host.
- **Streaming** — `predict_stream` + the `/predict_stream` route for the
  generative project.
- **Readiness `kind` discriminator** — surface each predictor's type
  (`onnx`/`sklearn`/`external-api`) in `/health/ready`.
- **CI** — wire the `pytest` step into the `ml-service` job (currently lint-only).
