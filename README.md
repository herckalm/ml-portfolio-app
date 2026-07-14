# ML Portfolio App

> A multi-tenant platform where machine-learning practitioners build, manage, and publicly share their project portfolios — with a live inference service behind it.

Each user gets a private dashboard to manage their work and a public, shareable page (e.g. `/u/your-handle`) they can hand to a recruiter — no login required to view. Published projects can be backed by a real model: the platform ships with two working predictors served from a dedicated inference service.

> **Status:** deployed and live on Fly.io — graduation project for the AUEB Coding Factory, built as a full-stack MLOps showcase. Both NLP and CV predictors are live end-to-end. See the [Roadmap](#roadmap).

## Live deployment

| Service                       | URL                                        |
| ----------------------------- | ------------------------------------------ |
| Frontend (public entry point) | https://ml-portfolio-web.fly.dev           |
| Backend API                   | https://ml-portfolio-api.fly.dev           |
| ML inference service          | https://ml-portfolio-ml.fly.dev            |
| Example portfolio             | https://ml-portfolio-web.fly.dev/u/iraklis |

## Overview

ML Portfolio App turns a single ML portfolio into a small platform. A layered ASP.NET Core API with JWT authentication and per-user data ownership fronts a PostgreSQL system of record; a React single-page app is the client; and a FastAPI inference service serves model predictions to the backend over a private network. Projects are private drafts until their owner publishes them, at which point they appear on that owner's public portfolio page — and a published project can be wired to a runnable model via its `ModelId`.

The inference service is **artifact-gated**: its model bundles are delivered at runtime from Cloudflare R2 (object storage), verified by SHA-256 checksum, and loaded on boot. If no artifact is present the service still starts and serves a graceful **demo mode**, so the product never hard-fails on a missing model.

## Architecture

Four services, with PostgreSQL as the system of record. The inference service is wired into the request path, reached only by the backend — never the browser.

React (Vite + TypeScript) ──► nginx (same-origin proxy)
│ HTTP / JSON
▼
ASP.NET Core 10 (API · Auth · CRUD · RFC 7807)
│
┌────────────────┴────────────────────┐
▼ ▼
PostgreSQL typed HttpClient
(system of record) │
▼
FastAPI ml-service (inference)
▲
artifact pull + sha256 verify (on boot)
│
Cloudflare R2 (object store)

The backend owns authentication, tenancy, and translating the inference service's responses into the API's envelope — including converting a `503` (model not loaded) into a `200` demo-mode response so the UI degrades gracefully. Full integration boundary: [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md) §9.

The backend follows a clean layered structure:

Controllers → HTTP endpoints, authorization attributes
Services → business logic, ownership checks, mapping
Repositories → data access (EF Core)
Domain → entities
DTOs → request/response contracts (+ PagedResult<T>)

Errors are returned as RFC 7807 `problem+json` through a global exception handler. List endpoints return a paged envelope:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20 }
```

Tenancy is row-level: every project carries an `OwnerId`, queries are scoped to the authenticated caller, and cross-tenant access is rejected (returned as _not found_, so a foreign resource's existence is never revealed).

## Tech stack

| Layer         | Technology                                                      |
| ------------- | --------------------------------------------------------------- |
| Backend API   | ASP.NET Core 10, EF Core, Npgsql, PostgreSQL                    |
| Auth          | JWT bearer (register / login)                                   |
| Frontend      | React + TypeScript (Vite), Tailwind CSS v4, shadcn/ui           |
| Data / state  | TanStack Query, axios, Zod                                      |
| ML service    | FastAPI, Uvicorn, uv; onnxruntime + tokenizers + Pillow + numpy |
| Object store  | Cloudflare R2 (production); MinIO S3-compatible (local dev)     |
| Orchestration | Docker Compose (local); Fly.io (production)                     |
| CI / CD       | GitHub Actions (path-filtered jobs); Fly.io deploy targets      |

The inference dependencies are deliberately light — the exported models are served as **ONNX** via `onnxruntime`, with no `torch` or `transformers` in the runtime image.

## Services

| Folder        | Stack                          | Local port  | Fly app                          | Status              |
| ------------- | ------------------------------ | ----------- | -------------------------------- | ------------------- |
| `/backend`    | ASP.NET Core 10, EF Core, JWT  | 5013 → 8080 | `ml-portfolio-api`               | Live                |
| `/frontend`   | React, Vite, TypeScript, nginx | 8080 → 80   | `ml-portfolio-web`               | Live                |
| `/ml-service` | FastAPI, ONNX runtime          | 8000        | `ml-portfolio-ml`                | Live (2 predictors) |
| PostgreSQL    | postgres:16-alpine             | 5432        | `ml-portfolio-db` (Fly Postgres) | Live                |
| MinIO         | S3-compatible object store     | 9000 / 9001 | — (replaced by R2 in production) | Local dev only      |

## Getting started

The primary path is Docker Compose — it brings up all services, applies migrations, pulls and verifies the model artifacts, and wires everything together.

### Prerequisites

- Docker + Docker Compose
- (For real inference) local model exports to seed once — see [Artifact delivery](#artifact-delivery). Without them, the stack runs in demo mode.

### Run the full stack (Compose)

```bash
cp .env.example .env        # fill in the blank secrets (POSTGRES_*, JWT_SECRET, MINIO_*)
docker compose up -d        # postgres → migrator → backend → ml-service → frontend (+ minio)
```

Then:

- Frontend → http://localhost:8080
- Backend API → http://localhost:5013
- ml-service → http://localhost:8000/health
- MinIO console → http://localhost:9001

To serve real (non-demo) inference, seed the model bundle once (see below) before or between `up`s.

### Artifact delivery

The model bundles live in a separate repo, are gitignored, and never travel through git. Under Compose, a one-shot `artifact-init` container pulls them from MinIO into a shared `ml_artifacts` volume and verifies them with `sha256sum -c` before ml-service boots. Seed the bucket once from your local exports:

```bash
docker compose up -d minio
docker compose --profile seed run --rm minio-seed   # NLP_ARTIFACT_SOURCE_DIR + CV_ARTIFACT_SOURCE_DIR → bucket
docker compose up -d
```

`NLP_ARTIFACT_SOURCE_DIR`, `CV_ARTIFACT_SOURCE_DIR`, `ARTIFACT_BUCKET`, and `ARTIFACT_VERSION` (in `.env`) control the seed. If a versioned prefix is absent, `artifact-init` writes nothing and ml-service falls back to demo mode for that model.

In production (Fly.io), artifacts are pulled from **Cloudflare R2** on first boot via the same `mc` path — only the alias and credentials differ. The R2 bucket `ml-artifacts` holds both bundles pre-seeded.

### Run a service from source (secondary)

**Backend**

```bash
cd backend
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "..."
dotnet user-secrets set "Jwt:Secret" "..."
dotnet ef database update
dotnet run                  # → http://localhost:5013
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                 # → http://localhost:5173 (proxies /api/* to :5013)
```

**ML service**

```bash
cd ml-service
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Continuous integration

GitHub Actions runs on every PR to `main`. A `Detect changes` job (path filter) decides which downstream jobs run, so a docs-only or single-service change doesn't rebuild everything:

| Job                         | Runs when…                                         |
| --------------------------- | -------------------------------------------------- |
| Frontend (lint + build)     | `frontend/**` changed                              |
| Backend (build)             | `backend/**` changed                               |
| ML service (lint + test)    | `ml-service/**` changed                            |
| Integration (compose smoke) | `backend/**`, `docker-compose.yml`, or test script |
| Real-pull (non-demo infer)  | `ml-service/**` or `docker-compose.yml`            |
| CI success (required gate)  | always — aggregates the above                      |

The **Real-pull** job stands up MinIO, seeds a tiny fixture bundle, boots ml-service through the real artifact pull-and-verify path, and asserts a genuine non-demo prediction — proving the whole artifact pipeline on every relevant PR without the full production bundles.

## Continuous deployment

On every merge to `main`, a path-filtered CD workflow deploys only the services that changed, in dependency order: `ml-service` → `backend` → `frontend`. Each deploy job uses `flyctl deploy --remote-only` so builds happen on Fly's infrastructure.

```bash
# secrets required in the GitHub repo
FLY_API_TOKEN   # org-scoped Fly deploy token
```

## Deployment (Fly.io)

Three Fly apps in region `fra` (Frankfurt):

| App                | Config                | Notes                                            |
| ------------------ | --------------------- | ------------------------------------------------ |
| `ml-portfolio-api` | `backend/fly.toml`    | `shared-cpu-1x`, 512 MB; min 1 machine           |
| `ml-portfolio-web` | `frontend/fly.toml`   | `shared-cpu-1x`, 256 MB; scales to zero          |
| `ml-portfolio-ml`  | `ml-service/fly.toml` | `shared-cpu-1x`, 1 GB; 3 GB volume for artifacts |

The ml-service pulls artifacts from R2 on first boot (skips if already present on the volume) and binds uvicorn to `0.0.0.0:8000`. The backend reaches it via its public HTTPS URL (`https://ml-portfolio-ml.fly.dev`). The frontend proxies `/api/*` to the backend over Fly's internal 6PN network.

EF Core migrations are applied manually via SSH when a new migration is added:

```bash
fly ssh console --app ml-portfolio-api
/app/efbundle --connection "$ConnectionStrings__DefaultConnection"
```

## Testing

```bash
# backend
cd backend && dotnet test

# ml-service
cd ml-service && uv run pytest   # contract tests run without an artifact;
                                  # live-inference test skips unless the bundle is present
```

## Project structure

ml-portfolio-app/
├── backend/ ASP.NET Core API (Domain / DTOs / Repositories / Services / Controllers)
├── frontend/ React + TypeScript SPA (Vite, Tailwind v4, shadcn/ui)
├── ml-service/ FastAPI inference service (pluggable predictor host, ONNX)
│ └── scripts/ artifact-init.sh (R2 pull + verify), entrypoint.sh
├── docker-compose.yml Local stack (postgres, minio, seed/init, migrator, backend, ml-service, frontend)
└── .github/workflows/ CI (path-filtered) + CD (Fly.io deploy on merge to main)

## Roadmap

- [x] Layered backend API with JWT auth
- [x] Project CRUD + pagination (`PagedResult<T>`)
- [x] Project ownership (`OwnerId`) + multi-tenant scoping
- [x] Frontend foundation (Vite, Tailwind v4, shadcn/ui, typed API client)
- [x] Public, shareable portfolio pages (`/u/:handle`)
- [x] Publish / draft visibility control
- [x] ML inference service — predictor #1 (DistilBERT CFPB) live over ONNX
- [x] ML inference service — predictor #2 (ViT-Tiny CIFAR-10) live over ONNX
- [x] Object-store artifact delivery (R2 → verified pull → load) + demo-mode fallback
- [x] Project ↔ model link (`ModelId`) and per-project live demo (text + image upload)
- [x] CI with path-filtered jobs incl. real-pull artifact test
- [x] CD pipeline (Fly.io, org-scoped token, path-filtered deploy jobs)
- [x] Full production deployment on Fly.io (3 apps + managed Postgres)
- [ ] Predictors #3–#4 (clustering, generative/streaming)
- [ ] Refresh tokens + rate limiting on auth endpoints

## ML demos

- [x] NLP — Text Classification (DistilBERT, CFPB complaint routing) — **live**
- [x] Computer Vision — Image Classification (ViT-Tiny, CIFAR-10) — **live**
- [ ] Classical ML — Clustering _(planned)_
- [ ] Generative — Prompt Engineering over an external LLM _(planned)_

## Documentation

- [`backend/README.md`](backend/README.md) — backend setup and API detail
- [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md) — schema evolution, security posture, layer conventions, and the ml-service integration boundary (§9)
- [`ml-service/README.md`](ml-service/README.md) — predictor contract, response envelope, calibration, artifact delivery
- [`frontend/README.md`](frontend/README.md) — frontend setup and deployment

## License

MIT

## Author

Built by Iraklis Kalamas [@herckalm](https://github.com/herckalm) — AUEB Coding Factory graduation project.
