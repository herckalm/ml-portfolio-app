# Architecture

System-level documentation for the ML Portfolio application. This document
covers the overall shape, then goes layer by layer. The backend is documented in
full; the frontend section captures the cross-cutting patterns and is expanded
during the frontend documentation pass; the ML service is an early scaffold.

---

## 1. System context

The application is three services:

- **Backend API** (`backend/`, ASP.NET Core + PostgreSQL) — authentication,
  user profiles, and project CRUD. The system of record.
- **Frontend** (`frontend/`, React + TypeScript) — the SPA users interact with;
  renders public portfolios at `/u/{handle}` and the authenticated owner
  dashboard.
- **ML service** (`ml-service/`, FastAPI) — the model-inference layer. A
  health-only scaffold today; its resolved integration and target shape are
  documented in §9.

The frontend talks to the backend over HTTP (JSON). The ML service's integration
with the backend is resolved — live inference, proxied through the backend — and is
documented in §9.

```
React (Vite + TypeScript)
        │  HTTP / JSON
        ▼
ASP.NET Core 10  (API · Auth · CRUD)
        │
        ├──────────────▶  PostgreSQL  (via Docker Compose)
        │
        └──(planned)──▶  FastAPI  (ML inference service)
```

---

## 2. Backend shape

The backend is a layered ASP.NET Core API. A request flows inward through clear
boundaries, each depending only on the layer beneath it:

```
HTTP request
   │
   ▼
Controllers ......... routing, status codes, JWT identity extraction
   │  (DTOs in)
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
```

Cross-cutting concerns sit outside the request path: **configuration** binds and
validates options at startup (§4), **middleware** wraps every response in a
uniform error envelope (§7), and a set of **domain exceptions** carry semantic
failure across the layers. Each backend folder has its own `README.md`; the
sections below cover what spans them.

### Folder map

| Folder | Role | Docs |
|---|---|---|
| `Domain/Entities` | Persistent model (`User`, `Project`) | folder README |
| `Infrastructure/Data` | `AppDbContext` — schema source of truth | folder README |
| `Migrations` | Generated schema ledger | §6 below |
| `DTOs` | API contract shapes | folder README |
| `Repositories` | Data access | folder README |
| `Services` | Business logic | folder README |
| `Controllers` | HTTP layer | folder README |
| `Configuration` | Typed, validated options | §4 below |
| `Exceptions` | Domain failure types | §7 below |
| `Middleware` | Error envelope | §7 below |

---

## 3. Frontend shape

The frontend is a React + TypeScript SPA (Vite). It consumes the backend's HTTP
API, validates every response against the contract before use, and renders two
surfaces: the public portfolio at `/u/{handle}` and the authenticated owner
dashboard. A request flows from a route component, through a data hook, through
the transport layer, to the backend — and the response is parsed against a schema
on the way back.

> **Note:** this section captures the system-level frontend shape and the
> cross-cutting patterns. Per-folder depth (component breakdown, individual
> hooks, routing detail) is filled in during the frontend documentation pass; the
> folder map below is the index those READMEs hang off.

Two layers sit outside this path. **`src/types`** holds the Zod schemas — the
contract — that the transport layer parses against; they're the TS mirror of the
backend DTOs, so a response is validated against the same shape the backend
promised. **`src/auth`** owns the session and the login/register calls (it mints
the token everything else depends on), kept separate from the rest of the API
surface for that reason. Each folder has its own `README.md`; this section covers
what spans them.

### Folder map

| Folder           | Role                                        | Docs          |
| ---------------- | ------------------------------------------- | ------------- |
| `src/types`      | Zod schemas + inferred types (the contract) | folder README |
| `src/lib`        | axios transport + shared helpers            | folder README |
| `src/api`        | TanStack Query hooks (data layer)           | folder README |
| `src/auth`       | `AuthContext` — session + auth endpoints    | folder README |
| `src/components` | Reusable UI (`layout`, `projects`, `ui`)    | folder README |
| `src/pages`      | Route components (the container layer)       | folder README |

### Two cross-cutting patterns

Both touch the API contract, so they're worth stating at the system level (full
treatment in `frontend/README.md`):

- **Router-state draft-bypass.** A draft project 404s on the public GET — there's
  no public way to fetch one by id. So owner surfaces pass the full project object
  in router state, and the detail/edit pages prefer fetched data but fall back to
  it. This is what lets an owner view and edit their own unpublished drafts
  despite the public endpoint refusing them.
- **404-as-signal.** The client reads a 404 as meaningful domain state, not just
  an error: a draft-or-missing project, or an unknown handle, render dedicated
  "not found" views, while non-404 failures fall through to a generic error view.
  This pairs with the backend's don't-confirm-existence stance (§8) — the API
  returns 404 for "not yours," and the client treats that 404 as a clean signal.

### Contract coupling worth knowing

The frontend's Zod schemas are a hand-maintained mirror of the backend DTOs, not
generated from them. They stay slightly more lenient than the wire on purpose in
one spot (`gitHubUrl`), and slightly stricter in another (form input validates
before submit). The `PROJECT_DOMAINS` list and the `Domain` strings the backend
stores must agree by hand — there's no shared source. If a DTO changes, the
matching schema in `src/types` is the thing to update.

### Deployment

The frontend ships as a two-stage Docker image (Node build → nginx runtime); the
same image runs under Docker Compose locally and on Fly.io in production. nginx
serves the static build and reverse-proxies `/api` to the backend over the
private network, which is why the SPA is same-origin in production and
`VITE_API_BASE_URL` is left empty there. Details in `frontend/README.md`.

---

## 4. Configuration & startup

`Program.cs` is the composition root and boots in two phases: register services
and bind/validate configuration on the builder, then assemble the middleware
pipeline on the built app. Order matters in both phases.

The startup posture is **fail-fast**: a missing connection string, an absent JWT
section, or a too-short signing secret stops the boot rather than surfacing at
the first request. JWT options (`Configuration/JwtOptions`) bind from the `Jwt`
config section, validate via data annotations, and are checked again with
`ValidateOnStart()`. The bearer-auth setup additionally reads the values eagerly
(it needs them synchronously during registration), with explicit null guards —
this duplication is intentional and should not be "DRYed away."

All application services and repositories are registered **scoped** (per-request),
matching the `DbContext` lifetime.

**Per-environment notes.** Development runs plain HTTP on `:5013` (HTTPS
redirection is skipped); the dev connection string and a development JWT secret
come from user-secrets. CORS is locked to a single origin, the React dev server
at `http://localhost:5173`.

### What to change before deploying

Three values are environment-specific and must be set for any non-local deploy:

1. **Connection string** (`DefaultConnection`) — the target database.
2. **JWT secret / issuer / audience** — a real signing secret from a secret
   store, not the dev value.
3. **CORS origin** — replace `localhost:5173` with the deployed frontend origin.

---

## 5. Data model

Two entities, one relationship.

- **`User`** — account + auth state + public profile. Addressed by **email**
  (auth), **handle** (public profile), and **id** (self-service).
- **`Project`** — owned by exactly one user; draft until published.
- **Relationship** — `User` 1-to-many `Project`, with **cascade delete** (removing
  a user removes their projects).

The schema is defined in `AppDbContext.OnModelCreating`, which is the single
source of truth: column constraints, the unique indexes on `User.Email` and
`User.Handle`, and the composite index on `(Project.OwnerId, Project.IsPublished)`
that backs the public-by-handle listing.

### The handle-lowercasing invariant

Handles are stored lowercase, and this is a **cross-layer contract** enforced in
three places that must stay in agreement:

1. `HandleGenerator.Normalize` lowercases when deriving a handle.
2. `AuthService` lowercases an explicitly chosen handle before persisting.
3. `UserRepository`'s lookups normalize the query key to match.

If any one of these changes, lookups silently fail to find users whose handles
were written by a different rule. Treat it as a single invariant, not three
independent details.

---

## 6. Schema evolution (migrations)

`Migrations/` is a generated, append-only ledger — never hand-edited. The schema
evolved across four migrations; the narrative matters because two steps encode
deliberate decisions that look accidental in a diff.

1. **`InitialCreate` (2026-06-07)** — `Projects` table alone. No users, no
   ownership.
2. **`AddUsers` (2026-06-08)** — `Users` table with a unique index on `Email`.
   The two tables coexist but aren't yet related.
3. **`AddProjectOwnership` (2026-06-10)** — adds `Projects.OwnerId` (NOT NULL),
   the cascade FK, and an index on `OwnerId`. This ties the model together.
   **Deliberate detail:** the new required column is added with
   `defaultValue: 0`. On a fresh database this is harmless (no rows to backfill);
   on a populated one, any pre-existing project would get `OwnerId = 0`, pointing
   at no real user. It's the standard "add a required FK to a possibly-populated
   table" maneuver — a known tradeoff, not an oversight.
4. **`AddHandlesProfilesAndPublishing` (2026-06-15)** — the public-portfolio
   feature in one migration: `Handle` (unique), `DisplayName`, `Bio` on users;
   `IsPublished` on projects. **Deliberate detail:** it drops the standalone
   `IX_Projects_OwnerId` and replaces it with the composite
   `IX_Projects_OwnerId_IsPublished`. The composite covers `OwnerId`-only lookups
   as a leading-column prefix, so the standalone index was redundant — this is a
   considered optimization, not a lost index.

---

## 7. Error handling & exceptions

Errors are modeled as **domain exceptions thrown from services**, caught by a
single `GlobalExceptionHandler` (`Middleware`) registered first in the pipeline.
Every error response is RFC 7807 **ProblemDetails** — controllers never build
error payloads.

The mapping:

| Exception                           | Status | Meaning                                                      |
| ----------------------------------- | ------ | ------------------------------------------------------------ |
| `NotFoundException`                 | 404    | Missing — or owner-scoped resource not visible to the caller |
| `ConflictException`                 | 409    | Conflicts with existing state (duplicate email/handle)       |
| `UnauthorizedAccessException` (BCL) | 401    | Failed authentication                                        |
| `ForbiddenAccessException`          | 403    | _Defined and wired, but no current path throws it_           |
| _(anything else)_                   | 500    | Unexpected; detail logged, never returned                    |

Note the 401 comes from a framework type (`UnauthorizedAccessException`), not a
custom exception — the taxonomy is three custom types + one BCL type + the
catch-all. `ForbiddenAccessException` is wired to 403 but currently unused;
cross-tenant access deliberately uses `NotFoundException` instead (see §8).

---

## 8. Security posture

The backend takes a consistent **don't-confirm-existence** stance, implemented as
uniform error messages across three independent surfaces:

- **Login** — "Invalid credentials." for both unknown email and wrong password.
- **Handle selection** — "That handle isn't available." for both reserved and
  taken handles (so the reserved-word list isn't enumerable).
- **Owner-scoped project operations** — _not found_ and _not yours_ are
  indistinguishable; both return 404. The API never reveals whether another
  user's project id exists. This is why `ForbiddenAccessException` goes unused.

Other deliberate measures:

- **Passwords** are BCrypt-hashed; plaintext is never stored or logged.
- **JWT validation** checks issuer, audience, lifetime, and signing key on every
  request; the signing key in the bearer setup must match the one `JwtService`
  signs with.
- **Caller identity** is always taken from the validated token, never from
  request bodies or routes.

### Known exception to the leak-nothing rule

The `/health/db` readiness probe returns the exception message in its 503 body —
the one place an internal error detail reaches the client. It bypasses the global
handler (it's a hand-rolled try/catch, not a thrown domain exception). Acceptable
for a health probe behind infrastructure; revisit if these endpoints become
publicly reachable.

---

## 9. ML service & inference

The ML service (`ml-service/`, FastAPI) is the model-inference layer. Today it is
a **health-only skeleton** — no model loads, no inference route exists — but its
integration with the rest of the system is now settled, so this section records
the target architecture and names the delta between it and the current scaffold.
The shape is fixed once here because three more model projects (CV, clustering,
generative) will plug into it; the seams below are placed so they slot in without
a rewrite.

### Integration boundary

Inference is **live, proxied, and phased**: the browser calls the backend, and the
backend calls the ml-service over the private network — never the browser
directly. The §1 diagram already draws this arrow.

```
Browser ──HTTP──▶ Backend (auth · rate-limit · proxy) ──HTTP──▶ ml-service (private)
```

- **Proxied, not direct.** The backend already owns authentication and
  rate-limiting; routing inference through it keeps one security posture instead
  of two. A direct browser→ml-service path was rejected — it would expose an
  unauthenticated compute endpoint to the public and split auth across two
  surfaces.
- **Phased.** The ml-service ships as a real proxy path returning a stub today
  and a real prediction once an artifact exists. Moving from stub to real model
  is an implementation change behind a stable contract, **not** an architectural
  one — this section does not change when the first model lands.
- **Readiness-gated demo mode.** The service reports `model_loaded`. When it is
  false the service answers `503`, and the backend proxy returns a `200` body
  marked `demo_mode` rather than surfacing the error — so the product degrades
  gracefully to a canned response instead of breaking.
- **Errors fold into the existing envelope.** The ml-service emits plain `422`
  (input validation) and `503` (not ready); the backend proxy translates these
  into the same RFC 7807 **ProblemDetails** every other endpoint returns (§7), so
  the inference path is indistinguishable from the rest of the API to a client,
  and the don't-confirm-existence stance (§8) is preserved.
- **No CORS in the ml-service.** It is never browser-facing, so CORS stays owned
  by the proxy edge — consistent with how the frontend is served same-origin (§3)
  and how the backend scopes CORS to one origin (§4).

### A pluggable predictor host

The ml-service is **not** "the BERT server" — it is a host that loads one or more
**predictors** behind a stable interface and routes to them. BERT is predictor
#1, not the shape of the service.

- Requests hit `POST /v1/models/{model_id}/predict`; a registry resolves
  `model_id` to a predictor, and the result is wrapped in a uniform envelope
  (`{ model_id, model_version, result, meta }`). The backend and frontend code
  against the envelope; only the inner `result` varies by model.
- The seam is a **behavioral `Protocol`** — `load` / `predict` / `health`, plus
  `predict_stream` for streaming models — so each project supplies a predictor
  that *behaves* correctly without inheriting from a base class.
- The service runs as **one container with a lazy-loading registry** now.
  Splitting to one deployment per model later (if a model's dependencies or
  failure modes warrant isolation) is a configuration change, not a rewrite —
  which is the point of the registry + Protocol seam.

The full `Predictor` Protocol and the four-project variance analysis it is
designed against live in `ml-service/README.md`.

### Predictor #1 — the DistilBERT contract

The first model is a frozen, contract-tested artifact exported from the
`ml-portfolio-models` repo. Three decisions are already made on the research side
and this section honors them rather than re-deriving them:

- **Serve ONNX.** The artifact ships as a self-contained `model.onnx`; serving it
  via `onnxruntime` keeps `torch`/`transformers` out of the inference path
  (dependencies stay `onnxruntime` + `tokenizers` + `numpy`). The TF-IDF baseline
  statistically ties the model and is recorded as the deliberate alternative for
  cost-sensitive serving — serving ONNX while noting the baseline is the
  documented tradeoff, not an oversight.
- **Calibration-aware response.** The model's confidence is trustworthy only at
  the high end, so the service returns `{ label, score, calibrated,
  confidence_band }` and the frontend renders the **band**, never a raw
  percentage. The calibration temperature and threshold are owned by the service
  (from the artifact's `calibration.json`), not the caller — a low-confidence
  prediction surfaces as "please review," not a misleading "75%".
- **Vendored input cleaning.** The model was trained on text run through a fixed
  cleaning contract (Unicode normalization, control-character stripping,
  whitespace collapse) with a `MIN_CHARS` floor. The service vendors that same
  cleaning so a visitor pasting raw text doesn't bypass it and skew the
  distribution; inputs under the floor are rejected with `422`. The cleaning is
  **copied** from the research repo, not imported — the two repos share no runtime
  dependency.

### Cross-repo artifact delivery

The artifact lives in `ml-portfolio-models`, is gitignored, and is ~268 MB — so it
**never travels through git** into this repo.

- **Volume mount now.** The bundle is mounted into the container at a known path.
  This lets the image build and run **today with no artifact present** — the
  predictor reports `model_loaded = false` and the service serves demo mode.
- **Object-store pull is the production target** — a versioned, checksum-verified
  download from an artifact store — recorded here as the next step, not built yet.
- **A deliberate inversion of the §4 fail-fast posture.** The backend stops
  booting on missing config; the ml-service does **not** stop booting on a missing
  artifact. This looks inconsistent but is intentional: graceful degradation is
  the whole purpose of the readiness gate, so the service is fail-fast on
  *configuration* and graceful-degrade on *the artifact*. A missing bundle must
  leave the process up and reporting `model_loaded = false`.

### Stateless

The ml-service holds **no application data**. Prediction logging and persistence,
if added, belong to the backend, which already owns the database, auth, and
request context. The current scaffold's `asyncpg` dependency and `/health/db`
probe are **template residue** copied from the backend skeleton — the backend is
the service that legitimately owns a database readiness probe (§8) — and are
slated for removal so the readiness story stays single-axis ("can I serve a
prediction"), uncoupled from any database.

### Scaffold state today

The skeleton is a conventional FastAPI layout (`app/` package, `routers/`
subpackage, uv-managed dependencies, multi-stage Dockerfile with a non-root
runtime and a liveness `HEALTHCHECK`). What exists versus what the architecture
above requires:

| Concern | Scaffold today | Target |
|---|---|---|
| Liveness (`/health`) | present | unchanged |
| Readiness (`model_loaded`) | absent | predictor-backed gate |
| Inference route | absent | `POST /v1/models/{id}/predict` |
| Predictor registry / Protocol | absent | core of the host |
| Response schema | absent | uniform envelope + calibrated result |
| Input cleaning / `MIN_CHARS` | absent | vendored, `422` on violation |
| Artifact mount point | absent | volume mount → object-store pull |
| Inference dependencies | absent (FastAPI only) | `onnxruntime`, `tokenizers`, `numpy` |
| DB coupling (`asyncpg`, `/health/db`) | present (residue) | removed |

Per-endpoint detail, the predictor contract, and setup live in
`ml-service/README.md`.

---

## 10. Open questions

- **ML inference integration — resolved.** The integration boundary is settled —
  live inference, proxied (browser → backend → ml-service) — and is documented in
  §9.
- **`Role` as a string.** Works today; a candidate for an enum or constants type
  if roles multiply.
