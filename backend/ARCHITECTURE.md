# Architecture

System-level documentation for the ML Portfolio application. This document covers the overall shape, then goes layer by layer. The backend is documented in full; the frontend section captures the cross-cutting patterns; the ML service integration is documented in §9.

---

## 1. System context

The application is three services:

- **Backend API** (`backend/`, ASP.NET Core + PostgreSQL) — authentication, user profiles, and project CRUD. The system of record.
- **Frontend** (`frontend/`, React + TypeScript) — the SPA users interact with; renders public portfolios at `/u/{handle}` and the authenticated owner dashboard.
- **ML service** (`ml-service/`, FastAPI) — the model-inference layer. Two predictors are live: DistilBERT CFPB (NLP text classification) and ViT-Tiny CIFAR-10 (CV image classification), both served via an object-store artifact pull from Cloudflare R2, with demo mode as the fallback. Integration and shape are documented in §9.

The frontend talks to the backend over HTTP (JSON). The ML service is proxied through the backend — never called by the browser directly.

React (Vite + TypeScript)
│ HTTP / JSON
▼
ASP.NET Core 10 (API · Auth · CRUD · Inference Proxy)
│
├──────────────▶ PostgreSQL (system of record)
│
└──────────────▶ FastAPI (ML inference service)
▲
artifact pull + sha256 verify (on boot)
│
Cloudflare R2 (object store)

---

## 2. Backend shape

The backend is a layered ASP.NET Core API. A request flows inward through clear boundaries, each depending only on the layer beneath it:

HTTP request
│
▼
Controllers ......... routing, status codes, JWT identity extraction
│ (DTOs in)
▼
Services ............ business logic, authorization, entity↔DTO mapping
│
▼
Repositories ........ data access, tracked/untracked reads, paging
│
▼
AppDbContext (EF) ... schema source of truth
│
▼
PostgreSQL

Cross-cutting concerns sit outside the request path: **configuration** binds and validates options at startup (§4), **middleware** wraps every response in a uniform error envelope (§7), and a set of **domain exceptions** carry semantic failure across the layers. Each backend folder has its own `README.md`; the sections below cover what spans them.

### Folder map

| Folder                | Role                                        | Docs          |
| --------------------- | ------------------------------------------- | ------------- |
| `Domain/Entities`     | Persistent model (`User`, `Project`)        | folder README |
| `Infrastructure/Data` | `AppDbContext` — schema source of truth     | folder README |
| `Migrations`          | Generated schema ledger                     | §6 below      |
| `DTOs`                | API contract shapes                         | folder README |
| `Repositories`        | Data access                                 | folder README |
| `Services`            | Business logic + `MlServiceClient`          | folder README |
| `Controllers`         | HTTP layer (Auth, Projects, Users, Predict) | folder README |
| `Configuration`       | Typed, validated options                    | §4 below      |
| `Exceptions`          | Domain failure types                        | §7 below      |
| `Middleware`          | Error envelope                              | §7 below      |

---

## 3. Frontend shape

The frontend is a React + TypeScript SPA (Vite). It consumes the backend's HTTP API, validates every response against the contract before use, and renders two surfaces: the public portfolio at `/u/{handle}` and the authenticated owner dashboard. Published projects backed by a model show a live "Try it live" demo — text input for NLP models, image upload for CV models.

Two layers sit outside the main request path. **`src/types`** holds the Zod schemas — the contract — that the transport layer parses against; they're the TS mirror of the backend DTOs. **`src/auth`** owns the session and the login/register calls (it mints the token everything else depends on). Each folder has its own `README.md`; this section covers what spans them.

### Folder map

| Folder           | Role                                                | Docs          |
| ---------------- | --------------------------------------------------- | ------------- |
| `src/types`      | Zod schemas + inferred types (the contract)         | folder README |
| `src/lib`        | axios transport + shared helpers                    | folder README |
| `src/api`        | TanStack Query hooks (data layer)                   | folder README |
| `src/auth`       | `AuthContext` — session + auth endpoints            | folder README |
| `src/components` | Reusable UI (`layout`, `projects`, `predict`, `ui`) | folder README |
| `src/pages`      | Route components (the container layer)              | folder README |

### Two cross-cutting patterns

- **Router-state draft-bypass.** A draft project 404s on the public GET — there's no public way to fetch one by id. So owner surfaces pass the full project object in router state, and the detail/edit pages prefer fetched data but fall back to it. This is what lets an owner view and edit their own unpublished drafts despite the public endpoint refusing them.
- **404-as-signal.** The client reads a 404 as meaningful domain state, not just an error: a draft-or-missing project, or an unknown handle, render dedicated "not found" views, while non-404 failures fall through to a generic error view. This pairs with the backend's don't-confirm-existence stance (§8).

### Live demo routing

`ProjectDetail` renders a "Try it live" section when a project has a `modelId`. The demo UI is routed by model id prefix: `distilbert-*` → text input, `vit-*` → image upload. Adding a new model type is adding a branch in the `ModelDemo` router component.

### Contract coupling worth knowing

The frontend's Zod schemas are a hand-maintained mirror of the backend DTOs, not generated from them. The `PROJECT_DOMAINS` list and the `Domain` strings the backend stores must agree by hand — there's no shared source. If a DTO changes, the matching schema in `src/types` is the thing to update.

### Deployment

The frontend ships as a two-stage Docker image (Node build → nginx runtime). nginx serves the static build and reverse-proxies `/api` to the backend over the private network, which is why `VITE_API_BASE_URL` is left empty in production. Details in `frontend/README.md`.

---

## 4. Configuration & startup

`Program.cs` is the composition root and boots in two phases: register services and bind/validate configuration on the builder, then assemble the middleware pipeline on the built app. Order matters in both phases.

The startup posture is **fail-fast**: a missing connection string, an absent JWT section, or a too-short signing secret stops the boot rather than surfacing at the first request. JWT options (`Configuration/JwtOptions`) bind from the `Jwt` config section, validate via data annotations, and are checked again with `ValidateOnStart()`. The bearer-auth setup additionally reads the values eagerly (it needs them synchronously during registration), with explicit null guards — this duplication is intentional and should not be "DRYed away."

All application services and repositories are registered **scoped** (per-request), matching the `DbContext` lifetime.

**Per-environment notes.** Development runs plain HTTP on `:5013` (HTTPS redirection is skipped); the dev connection string and a development JWT secret come from user-secrets. CORS is locked to a single origin, the React dev server at `http://localhost:5173`.

**Production (Fly.io).** Environment-specific values are injected as Fly secrets (`ConnectionStrings__DefaultConnection`, `Jwt__Secret`) and `fly.toml` env vars (`Jwt__Issuer`, `Jwt__Audience`, `MlService__BaseUrl`). The `MlService__BaseUrl` points to the ml-service's public HTTPS URL (`https://ml-portfolio-ml.fly.dev`).

---

## 5. Data model

Two entities, one relationship.

- **`User`** — account + auth state + public profile. Addressed by **email** (auth), **handle** (public profile), and **id** (self-service).
- **`Project`** — owned by exactly one user; draft until published. Optionally linked to a runnable model via `ModelId` (the registry key, e.g. `"distilbert-cfpb"`).
- **Relationship** — `User` 1-to-many `Project`, with **cascade delete** (removing a user removes their projects).

The schema is defined in `AppDbContext.OnModelCreating`, which is the single source of truth: column constraints, the unique indexes on `User.Email` and `User.Handle`, and the composite index on `(Project.OwnerId, Project.IsPublished)` that backs the public-by-handle listing.

### The handle-lowercasing invariant

Handles are stored lowercase, and this is a **cross-layer contract** enforced in three places that must stay in agreement:

1. `HandleGenerator.Normalize` lowercases when deriving a handle.
2. `AuthService` lowercases an explicitly chosen handle before persisting.
3. `UserRepository`'s lookups normalize the query key to match.

If any one of these changes, lookups silently fail to find users whose handles were written by a different rule. Treat it as a single invariant, not three independent details.

---

## 6. Schema evolution (migrations)

`Migrations/` is a generated, append-only ledger — never hand-edited. The schema evolved across five migrations:

1. **`InitialCreate` (2026-06-07)** — `Projects` table alone. No users, no ownership.
2. **`AddUsers` (2026-06-08)** — `Users` table with a unique index on `Email`. The two tables coexist but aren't yet related.
3. **`AddProjectOwnership` (2026-06-10)** — adds `Projects.OwnerId` (NOT NULL), the cascade FK, and an index on `OwnerId`. **Deliberate detail:** the new required column is added with `defaultValue: 0`. On a fresh database this is harmless (no rows to backfill); on a populated one, any pre-existing project would get `OwnerId = 0`, pointing at no real user — a known tradeoff, not an oversight.
4. **`AddHandlesProfilesAndPublishing` (2026-06-15)** — the public-portfolio feature in one migration: `Handle` (unique), `DisplayName`, `Bio` on users; `IsPublished` on projects. **Deliberate detail:** it drops the standalone `IX_Projects_OwnerId` and replaces it with the composite `IX_Projects_OwnerId_IsPublished`. The composite covers `OwnerId`-only lookups as a leading-column prefix, so the standalone index was redundant — a considered optimization, not a lost index.
5. **`AddProjectModelId` (2026-07-07)** — adds `Projects.ModelId` (`varchar(100)`, nullable). The registry key of the runnable predictor backing a project (e.g. `"distilbert-cfpb"`, `"vit-cifar10"`), or `null` when the project has no live demo. Set directly in the database; not exposed through the create/update API contract by design.

---

## 7. Error handling & exceptions

Errors are modeled as **domain exceptions thrown from services**, caught by a single `GlobalExceptionHandler` (`Middleware`) registered first in the pipeline. Every error response is RFC 7807 **ProblemDetails** — controllers never build error payloads.

The mapping:

| Exception                           | Status | Meaning                                                      |
| ----------------------------------- | ------ | ------------------------------------------------------------ |
| `NotFoundException`                 | 404    | Missing — or owner-scoped resource not visible to the caller |
| `ConflictException`                 | 409    | Conflicts with existing state (duplicate email/handle)       |
| `UnauthorizedAccessException` (BCL) | 401    | Failed authentication                                        |
| `ForbiddenAccessException`          | 403    | _Defined and wired, but no current path throws it_           |
| _(anything else)_                   | 500    | Unexpected; detail logged, never returned                    |

`ForbiddenAccessException` is wired to 403 but currently unused; cross-tenant access deliberately uses `NotFoundException` instead (see §8).

---

## 8. Security posture

The backend takes a consistent **don't-confirm-existence** stance, implemented as uniform error messages across three independent surfaces:

- **Login** — "Invalid credentials." for both unknown email and wrong password.
- **Handle selection** — "That handle isn't available." for both reserved and taken handles (so the reserved-word list isn't enumerable).
- **Owner-scoped project operations** — _not found_ and _not yours_ are indistinguishable; both return 404. The API never reveals whether another user's project id exists. This is why `ForbiddenAccessException` goes unused.

Other deliberate measures:

- **Passwords** are BCrypt-hashed; plaintext is never stored or logged.
- **JWT validation** checks issuer, audience, lifetime, and signing key on every request.
- **Caller identity** is always taken from the validated token, never from request bodies or routes.

### Known exception to the leak-nothing rule

The `/health/db` readiness probe returns the exception message in its 503 body — the one place an internal error detail reaches the client. Acceptable for a health probe behind infrastructure; revisit if these endpoints become publicly reachable.

---

## 9. ML service & inference

The ML service (`ml-service/`, FastAPI) is the model-inference layer. Two predictors are live: DistilBERT CFPB (predictor #1, NLP) and ViT-Tiny CIFAR-10 (predictor #2, CV). This section records the integration boundary and the artifact-delivery mechanism. The shape is fixed once here because two more model projects (clustering, generative) will plug into it; the seams below are placed so they slot in without a rewrite.

### Integration boundary

Inference is **live, proxied**: the browser calls the backend, and the backend calls the ml-service via its public HTTPS URL — never the browser directly.

Browser ──HTTP──▶ Backend (auth · rate-limit · proxy) ──HTTPS──▶ ml-service (public URL)

- **Proxied, not direct.** The backend already owns authentication and rate-limiting; routing inference through it keeps one security posture instead of two.
- **Readiness-gated demo mode.** The service reports `model_loaded` per predictor. When false, the service answers `503`, and the backend proxy returns a `200` body marked `demo_mode` rather than surfacing the error — so the product degrades gracefully to a canned response instead of breaking.
- **Errors fold into the existing envelope.** The ml-service emits plain `422` (input validation), `415` (unsupported media type), and `503` (not ready); the backend proxy translates these into the same RFC 7807 ProblemDetails every other endpoint returns (§7).
- **No CORS in the ml-service.** It is never browser-facing, so CORS stays owned by the proxy edge.

### A pluggable predictor host

The ml-service is **not** "the BERT server" — it is a host that loads one or more **predictors** behind a stable interface and routes to them.

- Text requests hit `POST /v1/models/{model_id}/predict`; image requests hit `POST /v1/models/{model_id}/predict-image`. A registry resolves `model_id` to a predictor, and the result is wrapped in a uniform envelope (`{ model_id, model_version, result, meta }`).
- The seam is a **behavioral `Protocol`** — `load` / `predict` / `model_loaded`, plus `predict_stream` for streaming models — so each project supplies a predictor that _behaves_ correctly without inheriting from a base class.
- The service runs as **one container with a lazy-loading registry**. Splitting to one deployment per model later is a configuration change, not a rewrite.

The full `Predictor` Protocol and the four-project variance analysis live in `ml-service/README.md`.

### Predictor #1 — DistilBERT CFPB

- **Serve ONNX.** The artifact ships as a self-contained `model.onnx`; serving it via `onnxruntime` keeps `torch`/`transformers` out of the inference path.
- **Calibration-aware response.** The service returns `{ label, score, calibrated, confidence_band }` and the frontend renders the **band**, never a raw percentage. The calibration temperature and threshold are owned by the service (from the artifact's `calibration.json`), not the caller.
- **Vendored input cleaning.** The model was trained on text run through a fixed cleaning contract (Unicode normalization, control-character stripping, whitespace collapse) with a `MIN_CHARS` floor. The service vendors that same cleaning — copied from the research repo, not imported.

### Predictor #2 — ViT-Tiny CIFAR-10

- **Image input.** Accepts `multipart/form-data` uploads (`image/jpeg`, `image/png`, `image/webp`, `image/gif`). The backend `PredictController` reads the uploaded bytes and forwards them with the original content type.
- **Preprocessing.** PIL → RGB → resize 96×96 → ToTensor → ImageNet normalization → CHW float32, matching the export contract from `ml-portfolio-models`.
- **No calibration.** Score is raw softmax; no temperature scaling was applied to the ViT export. Result shape: `{ label, score }`.

### Artifact delivery (production — Fly.io + Cloudflare R2)

The model bundles live in `ml-portfolio-models`, are gitignored, and never travel through git. In production:

- `scripts/entrypoint.sh` runs before uvicorn on every cold boot. It checks whether both artifact directories are already present on the persistent Fly volume (`ml_artifacts`, 3 GB) and skips the download if so.
- On first boot, it calls `scripts/artifact-init.sh` which pulls both bundles from the **Cloudflare R2** bucket `ml-artifacts` and verifies them with `sha256sum -c` against the shipped manifests.
- R2 credentials are injected as Fly secrets (`MC_ALIAS_URL`, `MC_ACCESS_KEY`, `MC_SECRET_KEY`).

R2 bucket: ml-artifacts/
nlp/distilbert-cfpb/1.0.0/ model.onnx config.json tokenizer.json calibration.json SHA256SUMS
cv/vit-cifar10/1.0.0/ vit_best.onnx vit_best.onnx.data SHA256SUMS

### Artifact delivery (local — Docker Compose + MinIO)

Under Compose, a one-shot `artifact-init` container pulls the bundles into a shared `ml_artifacts` volume before ml-service boots. Seed the bucket once from local exports:

```bash
docker compose up -d minio
docker compose --profile seed run --rm minio-seed
docker compose up -d
```

The `mc` alias and credentials are the only things that differ between the MinIO (local) and R2 (production) paths — the pull-and-verify mechanism is identical.

### A deliberate inversion of the §4 fail-fast posture

The backend stops booting on missing config; the ml-service does **not** stop booting on a missing artifact. This looks inconsistent but is intentional: graceful degradation is the whole purpose of the readiness gate, so the service is fail-fast on _configuration_ and graceful-degrade on _the artifact_. A missing bundle must leave the process up and reporting `model_loaded = false`.

### Stateless

The ml-service holds **no application data**. Prediction logging and persistence, if added, belong to the backend, which already owns the database, auth, and request context.

### Service state

| Concern                          | State   | Notes                                    |
| -------------------------------- | ------- | ---------------------------------------- |
| Liveness (`/health`)             | present | Docker + Fly healthcheck target          |
| Readiness (`/health/ready`)      | present | per-predictor `model_loaded` gate        |
| Text inference route             | present | `POST /v1/models/{id}/predict`           |
| Image inference route            | present | `POST /v1/models/{id}/predict-image`     |
| Predictor registry / Protocol    | present | core of the host                         |
| Response envelope                | present | uniform envelope + model-specific result |
| Input cleaning / `MIN_CHARS`     | present | vendored, `422` on violation (NLP only)  |
| Artifact delivery                | present | R2 pull (production); MinIO pull (local) |
| Predictor #1 — DistilBERT CFPB   | live    | calibrated NLP text classification       |
| Predictor #2 — ViT-Tiny CIFAR-10 | live    | CV image classification                  |
| Predictors #3–#4                 | planned | clustering, generative/streaming         |

Per-endpoint detail, the predictor contract, and setup live in `ml-service/README.md`.

---

## 10. Open questions

- **Internal ml-service routing.** The backend currently reaches the ml-service via its public HTTPS URL. A private 6PN route would reduce latency and egress — blocked on Fly's handling of IPv4/IPv6 dual-stack for machine-to-machine uvicorn connections.
- **`Role` as a string.** Works today; a candidate for an enum or constants type if roles multiply.
