# ML Portfolio App

> A multi-tenant platform where machine-learning practitioners build, manage, and publicly share their project portfolios — with a live inference service behind it.

Each user gets a private dashboard to manage their work and a public, shareable page (e.g. `/u/your-handle`) they can hand to a recruiter — no login required to view. Published projects can be backed by a real model: the platform ships with a working NLP classifier served from its own inference service.

> **Status:** active development — graduation project for the AUEB Coding Factory, built as a full-stack MLOps showcase. The backend, frontend, and the inference service's first predictor are live end-to-end; predictors #2–#4 and the user dashboard are in progress. See the [Roadmap](#roadmap).

## Overview

ML Portfolio App turns a single ML portfolio into a small platform. A layered ASP.NET Core API with JWT authentication and per-user data ownership fronts a PostgreSQL system of record; a React single-page app is the client; and a FastAPI inference service serves model predictions to the backend over a private network. Projects are private drafts until their owner publishes them, at which point they appear on that owner's public portfolio page — and a published project can be wired to a runnable model via its `ModelId`.

The inference service is **artifact-gated**: its model bundle is delivered at runtime from an object store (MinIO under Compose), verified by checksum, and loaded on boot. If no artifact is present the service still starts and serves a graceful **demo mode**, so the product never hard-fails on a missing model.

## Architecture

Four services, with PostgreSQL as the system of record. The inference service is wired into the request path, reached only by the backend — never the browser.

React (Vite + TypeScript) ──► nginx (same-origin proxy)
│ HTTP / JSON
▼
ASP.NET Core 10 (API · Auth · CRUD · RFC 7807)
│
├──────────────► PostgreSQL (system of record)
│
└── typed HttpClient ► FastAPI ml-service (inference)
▲
│ artifact pull + sha256 verify (on boot)
│
MinIO (S3-compatible object store)

The backend owns authentication, tenancy, and translating the inference service's
responses into the API's envelope — including converting a `503` (model not loaded)
into a `200` demo-mode response so the UI degrades gracefully. Full integration
boundary: [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md) §9.

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

| Layer         | Technology                                                 |
| ------------- | ---------------------------------------------------------- |
| Backend API   | ASP.NET Core 10, EF Core, Npgsql, PostgreSQL               |
| Auth          | JWT bearer (register / login)                              |
| Frontend      | React + TypeScript (Vite), Tailwind CSS v4, shadcn/ui      |
| Data / state  | TanStack Query, axios, Zod                                 |
| ML service    | FastAPI, Uvicorn, uv; onnxruntime + tokenizers + numpy     |
| Object store  | MinIO (S3-compatible), `mc` for seed + verified pull       |
| Orchestration | Docker Compose (6 services, healthchecked)                 |
| CI / CD       | GitHub Actions (path-filtered jobs); Fly.io deploy targets |

The inference dependencies are deliberately light — the exported model is served
as **ONNX** via `onnxruntime`, with no `torch` or `transformers` in the runtime image.

## Services

| Folder        | Stack                             | Compose port | Status                     |
| ------------- | --------------------------------- | ------------ | -------------------------- |
| `/backend`    | ASP.NET Core 10, EF Core, JWT     | 5013 → 8080  | Active                     |
| `/frontend`   | React, Vite, TypeScript, nginx    | 8080 → 80    | Active                     |
| `/ml-service` | FastAPI, ONNX runtime             | 8000         | Live (predictor #1)        |
| PostgreSQL    | postgres:16-alpine                | 5432         | Active (system of record)  |
| MinIO         | object store + one-shot seed/init | 9000 / 9001  | Active (artifact delivery) |

## Getting started

The primary path is Docker Compose — it brings up all services, applies
migrations, pulls and verifies the model artifact, and wires everything together.

### Prerequisites

- Docker + Docker Compose
- (For the model) a local DistilBERT export to seed once — see [Artifact delivery](#artifact-delivery). Without it, the stack runs in demo mode.

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

To serve real (non-demo) inference, seed the model bundle once (see below) before
or between `up`s.

### Artifact delivery

The model bundle lives in a separate repo, is gitignored, and never travels through
git. Under Compose, a one-shot `artifact-init` container pulls it from MinIO into a
shared volume and verifies it with `sha256sum -c` before ml-service boots. Seed the
bucket once from your local export:

```bash
docker compose up -d minio
docker compose --profile seed run --rm minio-seed   # ARTIFACT_SOURCE_DIR → bucket
docker compose up -d
```

`ARTIFACT_SOURCE_DIR`, `ARTIFACT_BUCKET`, and `ARTIFACT_VERSION` (in `.env`) control
the seed. If the versioned prefix is absent, `artifact-init` writes nothing and
ml-service falls back to demo mode. Full detail — the predictor contract, the
response envelope, calibration, and swapping MinIO for cloud object storage — is in
[`ml-service/README.md`](ml-service/README.md).

### Run a service from source (secondary)

For focused work on one service without Compose:

**Backend**

```bash
cd backend
# configure connection string + JWT via `dotnet user-secrets`
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

GitHub Actions runs on every PR to `main`. A `Detect changes` job (path filter)
decides which downstream jobs run, so a docs-only or single-service change doesn't
rebuild everything:

| Job                         | Runs when…                                         |
| --------------------------- | -------------------------------------------------- |
| Frontend (lint + build)     | `frontend/**` changed                              |
| Backend (build)             | `backend/**` changed                               |
| ML service (lint + test)    | `ml-service/**` changed                            |
| Integration (compose smoke) | `backend/**`, `docker-compose.yml`, or test script |
| Real-pull (non-demo infer)  | `ml-service/**` or `docker-compose.yml`            |
| CI success (required gate)  | always — aggregates the above                      |

The **Real-pull** job is the notable one: it stands up MinIO, seeds a tiny fixture
bundle, boots ml-service through the real `artifact-init` pull-and-verify path, and
asserts a genuine non-demo prediction — proving the whole artifact pipeline on every
relevant PR (without dragging the full ~268 MB production bundle through CI).

## Testing

```bash
# backend
cd backend && dotnet test          # (tests under /tests/MlPortfolio.Api.Tests)

# ml-service
cd ml-service && uv run pytest      # contract tests run without an artifact;
                                    # live-inference test skips unless the bundle is present
```

## Deployment

Backend and frontend carry `fly.toml` targets for [Fly.io](https://fly.io). The
backend image produces a self-contained EF migration bundle applied via Fly's
`release_command`, and runs a curl-free, self-contained container healthcheck
(`dotnet MlPortfolio.Api.dll --health-check`). For a real deploy, the MinIO artifact
store is swapped for managed object storage (S3/R2) by repointing the `mc` alias and
credentials — the pull path is unchanged.

## Project structure

ml-portfolio-app/
├── backend/ ASP.NET Core API (layered: Domain / DTOs / Repositories / Services / Controllers)
├── frontend/ React + TypeScript SPA (Vite, Tailwind v4, shadcn/ui)
├── ml-service/ FastAPI inference service (pluggable predictor host, ONNX)
├── docker-compose.yml Six-service local stack (db, minio, seed/init, migrator, backend, ml-service, frontend)
└── .github/workflows/ CI (path-filtered build/test/integration/real-pull)

## Roadmap

- [x] Layered backend API with JWT auth
- [x] Project CRUD + pagination (`PagedResult<T>`)
- [x] Project ownership (`OwnerId`) + multi-tenant scoping
- [x] Frontend foundation (Vite, Tailwind v4, shadcn/ui, typed API client)
- [x] Public, shareable portfolio pages (`/u/:handle`)
- [x] Publish / draft visibility control
- [x] ML inference service — predictor #1 (DistilBERT CFPB) live over ONNX
- [x] Object-store artifact delivery (MinIO → verified pull → load) + demo-mode fallback
- [x] Project ↔ model link (`ModelId`) and project-detail demo
- [x] CI with path-filtered jobs incl. real-pull artifact test
- [ ] User dashboard for managing your own projects
- [ ] Predictors #2–#4 (CV image, clustering, generative) + streaming inference

## ML demos

- [x] NLP — Text Classification (DistilBERT, CFPB complaint routing) — **live**
- [ ] Computer Vision — Image Classification _(planned)_
- [ ] Classical ML — Clustering _(planned)_
- [ ] Generative — Prompt Engineering over an external LLM _(planned)_

## Documentation

- [`backend/README.md`](backend/README.md) — backend setup and API detail
- [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md) — schema evolution, security posture, layer conventions, and the ml-service integration boundary (§9)
- [`ml-service/README.md`](ml-service/README.md) — predictor contract, response envelope, calibration, artifact delivery
- [`frontend/README.md`](frontend/README.md) — frontend setup

## License

_TBD — add a license (e.g. MIT) before making the repository public._

## Author

Built by [@herckalm](https://github.com/herckalm) — AUEB Coding Factory graduation project.
