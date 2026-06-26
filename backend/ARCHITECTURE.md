# Architecture

System-level documentation for the ML Portfolio application. This document
covers the overall shape, then goes deep on the **backend** (the only service
documented in code so far). Frontend and ml-service are sketched at the system
level with detail deferred to their own passes.

---

## 1. System context

The application is three services:

- **Backend API** (`backend/`, ASP.NET Core + PostgreSQL) — authentication,
  user profiles, and project CRUD. The system of record. **Documented in full
  below.**
- **Frontend** (`frontend/`, React) — the SPA users interact with; renders
  public portfolios at `/u/{handle}` and the authenticated owner dashboard.
  _Documentation deferred to the frontend pass._
- **ML service** (`ml-service/`) — the model-inference layer. Currently a
  scaffold; gets documented when its scope is built out. _Deferred._

The frontend talks to the backend over HTTP (JSON). The ml-service's integration
boundary with the backend is still an open design question (see §7).

```
  React SPA  ──HTTP/JSON──▶  Backend API  ──▶  PostgreSQL
 (frontend)                  (backend)
                                  │
                                  └──(future)──▶  ML service
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
validates options at startup, **middleware** wraps every response in a uniform
error envelope, and a set of **domain exceptions** carry semantic failure across
the layers. Each layer has its own `README.md`; this document covers what spans
them.

### Folder map

| Folder                | Role                                    | Docs          |
| --------------------- | --------------------------------------- | ------------- |
| `Domain/Entities`     | Persistent model (`User`, `Project`)    | folder README |
| `Infrastructure/Data` | `AppDbContext` — schema source of truth | folder README |
| `Migrations`          | Generated schema ledger                 | §5 below      |
| `DTOs`                | API contract shapes                     | folder README |
| `Repositories`        | Data access                             | folder README |
| `Services`            | Business logic                          | folder README |
| `Controllers`         | HTTP layer                              | folder README |
| `Configuration`       | Typed, validated options                | §3 below      |
| `Exceptions`          | Domain failure types                    | §6 below      |
| `Middleware`          | Error envelope                          | §6 below      |

---

## 3. Configuration & startup

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

## 4. Data model

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

## 5. Schema evolution (migrations)

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

## 6. Error handling & exceptions

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
cross-tenant access deliberately uses `NotFoundException` instead (see §7).

---

## 7. Security posture

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

## 8. Open questions

- **ML inference integration (§1).** How and when the backend calls the
  ml-service is undecided — the July-vs-August scoping decision. The integration
  boundary (sync call, queue, separate gateway) will shape whether the backend
  grows an inference-proxy layer or the frontend calls the ml-service directly.
- **`Role` as a string.** Works today; a candidate for an enum or constants type
  if roles multiply.
