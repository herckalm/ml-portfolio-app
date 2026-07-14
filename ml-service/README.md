# ML Service

Model-inference layer for the **ML Portfolio** application. A FastAPI service that loads exported model artifacts and serves predictions to the backend over a private network.

> **Status: two predictors live.** DistilBERT CFPB (NLP text classification) and ViT-Tiny CIFAR-10 (CV image classification) are both deployed and serving real inference on Fly.io. Predictors #3–#4 (clustering, generative) remain planned. This README documents the current shape alongside the target architecture; each section marks which is which.

---

## Technology stack

| Technology  | Role                                  | Status |
| ----------- | ------------------------------------- | ------ |
| FastAPI     | Web framework, routing                | in use |
| Uvicorn     | ASGI server                           | in use |
| uv          | Dependency resolution + venv          | in use |
| onnxruntime | ONNX inference (predictors #1 and #2) | in use |
| tokenizers  | HF fast tokenizer (predictor #1)      | in use |
| Pillow      | Image preprocessing (predictor #2)    | in use |
| numpy       | Array ops on model I/O                | in use |

The inference dependencies are deliberately **light**: serving the exported ONNX artifacts needs `onnxruntime` + `tokenizers` + `Pillow` + `numpy`, with no `torch` or `transformers` in the runtime image.

---

## Architecture at a glance

The service is a **pluggable predictor host**, not a single-model server. A registry maps a `model_id` to a _predictor_, and one uniform envelope wraps every result regardless of which model produced it:

POST /v1/models/{model_id}/predict
POST /v1/models/{model_id}/predict-image
│
▼
Registry ........ model_id → Predictor (lazy-loaded)
│
▼
Predictor ....... load() / predict() + model_loaded ← behavioral Protocol
│
▼
Envelope ........ { model_id, model_version, result, meta }

The service sits **behind the backend** — the browser never calls it directly. The backend owns authentication, rate-limiting, and translating this service's errors into the API's RFC 7807 envelope. See `ARCHITECTURE.md` §9 for the full integration boundary.

### The predictor contract

Every model implements the same **behavioral `Protocol`** — structural typing, no base class, so the service never imports a concrete model class. A predictor exposes three read-only properties and two methods:

```python
from typing import Protocol, runtime_checkable
from app.schemas import PredictionResult

@runtime_checkable
class Predictor(Protocol):
    @property
    def model_id(self) -> str: ...

    @property
    def model_version(self) -> str: ...

    @property
    def model_loaded(self) -> bool: ...

    def load(self) -> None: ...

    def predict(self, input: str | bytes) -> PredictionResult: ...
```

`model_loaded` is `False` until `load()` succeeds and gates readiness and demo mode. A missing artifact must not crash the process — the predictor stays un-ready and the service degrades gracefully.

### Why a Protocol, not a fixed schema

Four model projects plug into this host, varying on the axes that would otherwise force a rewrite:

| Axis            | NLP / BERT             | CV image           | Clustering          | Generative¹         |
| --------------- | ---------------------- | ------------------ | ------------------- | ------------------- |
| Input transport | JSON text              | binary / multipart | JSON vector         | JSON prompt         |
| Preprocessing   | clean + tokenize       | resize / normalize | feature scale       | prompt template     |
| Result shape    | `{label, score, band}` | `{label, score}`   | `{cluster_id, ...}` | freeform text       |
| Calibration     | yes (T≈1.5)            | no                 | n/a                 | n/a                 |
| Artifact        | ONNX bundle            | ONNX bundle        | joblib              | templates + API key |
| Sync vs. stream | sync                   | sync               | sync                | **streaming**       |

¹ The generative project is prompt-engineering over an external LLM API — it hosts no weights.

---

## Project structure

ml-service/
├── app/
│ ├── main.py # FastAPI app + root route
│ ├── registry.py # model_id → Predictor, lazy loading
│ ├── schemas.py # request models + response envelope (Pydantic)
│ ├── cleaning.py # vendored input cleaning (frozen contract)
│ ├── predictors/
│ │ ├── init.py # the Predictor Protocol
│ │ ├── distilbert.py # predictor #1 (DistilBERT CFPB, ONNX)
│ │ └── vit.py # predictor #2 (ViT-Tiny CIFAR-10, ONNX)
│ └── routers/
│ ├── health.py # liveness + readiness
│ └── predict.py # POST /v1/models/{model_id}/predict + predict-image
├── scripts/
│ ├── artifact-init.sh # pulls artifacts from R2/MinIO, verifies SHA-256
│ └── entrypoint.sh # runs artifact-init on first boot, then starts uvicorn
├── tests/ # cleaning unit tests + API contract tests
├── artifacts/ # gitignored — populated at runtime from object store
├── Dockerfile # multi-stage uv build, non-root runtime, mc binary
├── fly.toml # Fly.io config (ml-portfolio-ml, fra, 1 GB, 3 GB volume)
├── pyproject.toml
└── uv.lock

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

The live-inference test is skipped automatically unless the artifact bundle is present at the resolved artifacts path; the contract tests (404/422/503, readiness, envelope) run without any artifact.

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

---

## Artifact delivery

The model bundles live in the separate `ml-portfolio-models` repo, are gitignored, and are never committed here. Two paths get them into the container; the registry reads them the same way either way, resolving each model to `${ARTIFACTS_DIR}/<relative_path>`:

| Model             | `model_id`        | On-disk path           |
| ----------------- | ----------------- | ---------------------- |
| DistilBERT CFPB   | `distilbert-cfpb` | `nlp/distilbert-cfpb/` |
| ViT-Tiny CIFAR-10 | `vit-cifar10`     | `cv/vit-cifar10/`      |

### Production (Fly.io + Cloudflare R2)

On Fly, `scripts/entrypoint.sh` runs before uvicorn on every cold boot. It checks whether both artifact directories are already on the persistent volume (`ml_artifacts`, 3 GB) and skips the download if so. On first boot, it calls `scripts/artifact-init.sh` which pulls both bundles from the R2 bucket `ml-artifacts` and verifies them with `sha256sum -c`:

R2 bucket: ml-artifacts/
nlp/distilbert-cfpb/1.0.0/ model.onnx config.json tokenizer.json calibration.json SHA256SUMS
cv/vit-cifar10/1.0.0/ vit_best.onnx vit_best.onnx.data SHA256SUMS

R2 credentials are injected as Fly secrets (`MC_ALIAS_URL`, `MC_ACCESS_KEY`, `MC_SECRET_KEY`).

### Local (Docker Compose + MinIO)

Under Compose, a one-shot `artifact-init` container pulls the bundles into a shared `ml_artifacts` volume before ml-service boots. Seed the bucket once from your local exports:

```bash
docker compose up -d minio
docker compose --profile seed run --rm minio-seed
docker compose up -d
```

`NLP_ARTIFACT_SOURCE_DIR`, `CV_ARTIFACT_SOURCE_DIR`, `ARTIFACT_BUCKET`, and `ARTIFACT_VERSION` (in `.env`) control the seed.

### Direct volume mount (local override)

For a quick local run without the object store:

```bash
docker run -p 8000:8000 \
  -v /path/to/nlp/export:/app/artifacts/nlp/distilbert-cfpb \
  -v /path/to/cv/export:/app/artifacts/cv/vit-cifar10 \
  ml-service
```

With neither path providing an artifact, the service still starts and serves demo mode.

---

## API endpoints

| Method | Endpoint                              | Description                                    |
| ------ | ------------------------------------- | ---------------------------------------------- |
| GET    | `/`                                   | Service identity + liveness                    |
| GET    | `/health`                             | Liveness probe — the process is up             |
| GET    | `/health/ready`                       | Readiness — reports `model_loaded` per model   |
| POST   | `/v1/models/{model_id}/predict`       | Text inference; result wrapped in the envelope |
| POST   | `/v1/models/{model_id}/predict-image` | Image inference; multipart/form-data upload    |

**Readiness** (`GET /health/ready`) is informational and always returns `200`; it reports `model_loaded` and `model_version` per registered model. The per-request `503` on `/predict` is what actually gates demo mode.

**Response envelope** (all models):

```json
{
  "model_id": "distilbert-cfpb",
  "model_version": "1.0.0",
  "result": { "...": "model-specific" },
  "meta": { "demo_mode": false, "input_chars": 57 }
}
```

**Predictor #1 — DistilBERT CFPB** (`distilbert-cfpb`):

```json
// POST /v1/models/distilbert-cfpb/predict
// request
{ "text": "My credit card was charged twice for the same transaction." }

// result
{ "label": "Credit card", "score": 0.94, "calibrated": true, "confidence_band": "high" }
```

Labels: `Credit reporting`, `Debt collection`, `Mortgage`, `Credit card`, `Checking or savings account`. Score is temperature-calibrated (T≈1.5); `confidence_band` is `"high"` above 0.75, `"low"` otherwise.

**Predictor #2 — ViT-Tiny CIFAR-10** (`vit-cifar10`):

```json
// POST /v1/models/vit-cifar10/predict-image
// request: multipart/form-data, field "file", accepted types: image/jpeg, image/png, image/webp, image/gif

// result
{ "label": "cat", "score": 0.89 }
```

Labels: `airplane`, `automobile`, `bird`, `cat`, `deer`, `dog`, `frog`, `horse`, `ship`, `truck`. No temperature calibration applied; score is raw softmax. Image is resized to 96×96, normalized with ImageNet statistics.

**Error behavior:**

- Input below `MIN_CHARS` floor (NLP, checked on cleaned text) → `422`
- Unsupported image type → `415`
- Unknown `model_id` → `404`
- Model not loaded → `503`; the backend converts this into a `200` demo-mode envelope

---

## Key design decisions

**Pluggable predictor host.** Adding a model is adding a predictor module and a registry entry — no change to the service shape.

**Proxied and internal.** Never browser-facing. No CORS config — the proxy edge owns browser concerns.

**Stateless.** Holds no application data. Prediction logging, if added, belongs to the backend.

**Light inference footprint.** Serves ONNX via `onnxruntime`; `torch` and `transformers` stay out of the runtime path.

**Calibration-aware responses.** Predictor #1 surfaces a calibrated confidence band (Guo et al., 2017 temperature scaling), not a raw probability. Predictor #2 returns a raw softmax score — no calibration was applied to the ViT export.

**Vendored input cleaning.** The NLP model was trained on text run through a fixed cleaning contract (Unicode normalization, control-char stripping, whitespace collapse). The service vendors that same cleaning — copied from the research repo, not imported.

**Fail-fast on config, graceful-degrade on the artifact.** A missing model artifact must not stop the boot — the process stays up, reports `model_loaded = false`, and serves demo mode.

---

## Future work

- **Predictors #3–#4** — clustering and the external LLM generative project
- **Streaming** — `predict_stream` + `/predict_stream` route for the generative project
- **Readiness `kind` discriminator** — surface each predictor's type (`onnx`/`sklearn`/`external-api`) in `/health/ready`
