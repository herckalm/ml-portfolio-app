# MlPortfolio API (Backend)

RESTful API for **MlPortfolio**, a portfolio platform for machine-learning projects. Manages users and their ML projects with JWT authentication, ownership-based access control, and PostgreSQL persistence via Entity Framework Core. Also proxies inference requests to the ML service.

Built with **ASP.NET Core (.NET 10)** following a layered architecture, the repository pattern, and dependency injection throughout.

---

## Technology stack

| Technology                                    | Version | Role                 |
| --------------------------------------------- | ------- | -------------------- |
| .NET / ASP.NET Core                           | 10.0    | Web framework        |
| Entity Framework Core                         | 10.0.8  | ORM                  |
| Npgsql.EntityFrameworkCore.PostgreSQL         | 10.0.2  | PostgreSQL driver    |
| Microsoft.AspNetCore.Authentication.JwtBearer | 10.0.8  | JWT middleware       |
| BCrypt.Net-Next                               | 4.2.0   | Password hashing     |
| Swashbuckle.AspNetCore                        | 10.2.1  | OpenAPI / Swagger UI |

---

## Architecture at a glance

A request flows inward through four layers, each depending only on the one beneath it:

Controllers → HTTP: routing, status codes, JWT identity extraction
Services → business logic, authorization, entity↔DTO mapping
Repositories → data access, tracked/untracked reads, paging
Domain / Data → entities + AppDbContext (schema source of truth)

Each folder has its own `README.md` explaining its conventions, and the top-level `ARCHITECTURE.md` covers what spans the layers (schema evolution, security posture, the cross-layer handle invariant). **Start there for the full picture**; this file is the entry point and setup guide.

---

## Project structure

backend/
├── Controllers/ HTTP layer (Auth, Projects, Users, Predict)
├── Services/ business logic + JwtService, HandleGenerator, MlServiceClient
├── Repositories/ data access (interface + impl per aggregate)
├── DTOs/ API contract shapes (+ DTOs/Common for pagination)
├── Domain/Entities/ persistent model (User, Project)
├── Infrastructure/Data/ AppDbContext — schema source of truth
├── Migrations/ generated schema ledger (do not hand-edit)
├── Configuration/ typed, validated options (JwtOptions, MlServiceOptions)
├── Exceptions/ domain failure types
├── Middleware/ GlobalExceptionHandler (RFC 7807 error envelope)
├── fly.toml Fly.io config (ml-portfolio-api, fra, 512 MB)
└── Program.cs composition root

---

## Getting started

### Prerequisites

- .NET 10 SDK
- PostgreSQL (running and reachable)

### Configuration

The API reads two things from configuration that are **required at startup** — the app fails fast (won't boot) if either is missing or invalid:

1. **`ConnectionStrings:DefaultConnection`** — the PostgreSQL connection string.
2. **The `Jwt` section** — `Secret` (≥ 32 chars for HMAC-SHA256), `Issuer`, `Audience`, and optional `ExpiryHours` (1–720, default 24).

In **development**, these come from .NET user-secrets rather than tracked files:

```bash
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Database=mlportfolio;Username=...;Password=..."
dotnet user-secrets set "Jwt:Secret"   "<a-32+-character-development-secret>"
dotnet user-secrets set "Jwt:Issuer"   "MlPortfolio"
dotnet user-secrets set "Jwt:Audience" "MlPortfolioClient"
```

`appsettings.Development.json` holds only placeholders — no real secrets are committed.

### Database setup

Apply the migrations to create the schema:

```bash
dotnet ef database update
```

### Run

```bash
dotnet run
```

The API binds to **`http://localhost:5013`** in development. Swagger UI is available in development for exploring the endpoints.

---

## API endpoints

### Authentication (`/api/auth`) — public

| Method | Endpoint             | Description                        |
| ------ | -------------------- | ---------------------------------- |
| POST   | `/api/auth/register` | Register a new user; returns a JWT |
| POST   | `/api/auth/login`    | Authenticate; returns a JWT        |

### Projects (`/api/projects`)

| Method | Endpoint                     | Auth        | Description                                          |
| ------ | ---------------------------- | ----------- | ---------------------------------------------------- |
| GET    | `/api/projects`              | JWT         | The caller's own projects (drafts included), paged   |
| GET    | `/api/projects/{id}`         | Public      | A single **published** project (draft/missing → 404) |
| POST   | `/api/projects`              | JWT         | Create a project                                     |
| PUT    | `/api/projects/{id}`         | JWT + owner | Full update                                          |
| PATCH  | `/api/projects/{id}/publish` | JWT + owner | Toggle publish state                                 |
| DELETE | `/api/projects/{id}`         | JWT + owner | Delete                                               |

### Users (`/api/users`)

| Method | Endpoint                       | Auth   | Description                           |
| ------ | ------------------------------ | ------ | ------------------------------------- |
| GET    | `/api/users/{handle}`          | Public | Public profile                        |
| GET    | `/api/users/{handle}/projects` | Public | That user's published projects, paged |
| PUT    | `/api/users/me`                | JWT    | Update own profile                    |
| DELETE | `/api/users/me`                | JWT    | Hard-delete own account               |

### Inference proxy (`/api/predict`) — public

| Method | Endpoint                       | Description                                                             |
| ------ | ------------------------------ | ----------------------------------------------------------------------- |
| POST   | `/api/predict/{modelId}`       | Proxies text inference to the ml-service; degrades to demo mode on 503  |
| POST   | `/api/predict/{modelId}/image` | Proxies image inference to the ml-service; degrades to demo mode on 503 |

The predict endpoints are public (no auth) — they are the demo surface for published portfolio projects. On ml-service `503` (model not loaded), the backend returns a `200` demo-mode envelope (`meta.demo_mode = true`) so the UI degrades gracefully rather than erroring.

### Health

| Endpoint     | Description                         |
| ------------ | ----------------------------------- |
| `/health`    | Liveness — the process is up        |
| `/health/db` | Readiness — PostgreSQL is reachable |

---

## Key design decisions

**Layered + repository pattern.** Controllers stay thin (HTTP only); services own all business logic and authorization; repositories abstract data access behind interfaces, so services depend on `IUserRepository` / `IProjectRepository` rather than concrete classes — testable with mocks, swappable without business-logic change.

**Authorization lives in the service layer**, not controllers. Owner-scoped operations treat _not found_ and _not owned_ identically — both return **404** — so the API never reveals whether another user's resource exists.

**Centralized error handling.** Services throw domain exceptions (`NotFoundException` → 404, `ConflictException` → 409, `ForbiddenAccessException` → 403, `UnauthorizedAccessException` → 401); a single `GlobalExceptionHandler` translates them into RFC 7807 ProblemDetails responses. Controllers contain no try/catch.

**Security by design.** Passwords are BCrypt-hashed. JWT validation checks issuer, audience, lifetime, and signing key on every request. Caller identity always comes from the validated token, never request bodies. Error messages are deliberately uniform so they don't confirm which accounts, handles, or resources exist.

**Fail-fast startup.** JWT options bind, validate via data annotations, and run `ValidateOnStart()`; a missing connection string or JWT secret stops the boot rather than failing at the first request.

**Inference proxy with graceful degradation.** The `PredictController` is a thin proxy to the ml-service via `IMlServiceClient` (typed `HttpClient`). A `503` from the ml-service (model not loaded) is caught and converted to a `200` demo-mode response — product policy kept deliberately out of the transport layer.

**Pagination.** List endpoints return a `PagedResult<T>` (items + total + page + size); `PaginationQuery` caps page size at 50.

---

## Deployment (Fly.io)

The backend is deployed as `ml-portfolio-api` on Fly.io (region `fra`). Fly secrets hold the database connection string and JWT secret. The `ml-service` is reached via its public URL (`https://ml-portfolio-ml.fly.dev`), set via `MlService__BaseUrl`.

EF Core migrations are applied manually via SSH when a new migration is added:

```bash
fly ssh console --app ml-portfolio-api
/app/efbundle --connection "$ConnectionStrings__DefaultConnection"
```

The Dockerfile produces a self-contained EF migration bundle (`efbundle`) alongside the runtime image for this purpose.

---

## Future work

- **Refresh tokens** — pair a short-lived access token with a refresh token instead of a single long-lived JWT.
- **Rate limiting** — `POST /api/auth/login` has none; .NET 10's built-in `AddRateLimiter` would mitigate brute-force.
- **Unit tests** — every layer depends on interfaces, so the codebase is ready for mock-based testing; the tests themselves remain to be written.
- **Internal ml-service routing** — currently the backend reaches the ml-service via its public HTTPS URL; a private network route (once IPv6 dual-stack is supported) would reduce latency and egress.
