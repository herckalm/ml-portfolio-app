# MlPortfolio API (Backend)

RESTful API for **MlPortfolio**, a portfolio system for Machine Learning
projects. It manages users and their ML projects with JWT authentication,
ownership-based access control, and PostgreSQL persistence via Entity Framework
Core.

Built with **ASP.NET Core (.NET 10)** following a layered architecture, the
repository pattern, and dependency injection throughout.

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

A request flows inward through four layers, each depending only on the one
beneath it:

```
Controllers   → HTTP: routing, status codes, JWT identity extraction
Services      → business logic, authorization, entity↔DTO mapping
Repositories  → data access, tracked/untracked reads, paging
Domain / Data → entities + AppDbContext (schema source of truth)
```

This separation keeps each layer single-purpose, independently testable with
mocks, and swappable without cascading change (e.g. replacing the persistence
layer wouldn't touch services or controllers). Cross-cutting concerns —
configuration, the error-handling middleware, and domain exceptions — sit outside
the request path.

Each folder has its own `README.md` explaining its conventions, and the
top-level `ARCHITECTURE.md` covers what spans the layers (schema evolution,
security posture, the cross-layer handle invariant). **Start there for the full
picture**; this file is the entry point and setup guide.

---

## Project structure

```
backend/
├── Controllers/        HTTP layer (Auth, Projects, Users)
├── Services/           business logic + JwtService, HandleGenerator
├── Repositories/       data access (interface + impl per aggregate)
├── DTOs/               API contract shapes (+ DTOs/Common for pagination)
├── Domain/Entities/    persistent model (User, Project)
├── Infrastructure/Data/ AppDbContext — schema source of truth
├── Migrations/         generated schema ledger (do not hand-edit)
├── Configuration/      typed, validated options (JwtOptions)
├── Exceptions/         domain failure types
├── Middleware/         GlobalExceptionHandler (RFC 7807 error envelope)
└── Program.cs          composition root
```

---

## Getting started

### Prerequisites

- .NET 10 SDK
- PostgreSQL (running and reachable)

### Configuration

The API reads two things from configuration that are **required at startup** —
the app fails fast (won't boot) if either is missing or invalid:

1. **`ConnectionStrings:DefaultConnection`** — the PostgreSQL connection string.
2. **The `Jwt` section** — `Secret` (≥ 32 chars for HMAC-SHA256), `Issuer`,
   `Audience`, and optional `ExpiryHours` (1–720, default 24).

In **development**, these come from .NET user-secrets rather than tracked files:

```bash
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Database=mlportfolio;Username=...;Password=..."
dotnet user-secrets set "Jwt:Secret"   "<a-32+-character-development-secret>"
dotnet user-secrets set "Jwt:Issuer"   "MlPortfolio"
dotnet user-secrets set "Jwt:Audience" "MlPortfolioClient"
```

`appsettings.Development.json` holds only placeholders — no real secrets are
committed.

### Database setup

Apply the migrations to create the schema:

```bash
dotnet ef database update
```

### Run

```bash
dotnet run
```

The API binds to **`http://localhost:5013`** in development (plain HTTP; HTTPS
redirection is enabled only outside development). Swagger UI is available in
development for exploring the endpoints.

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

### Health

| Endpoint     | Description                         |
| ------------ | ----------------------------------- |
| `/health`    | Liveness — the process is up        |
| `/health/db` | Readiness — PostgreSQL is reachable |

The health endpoints support container orchestration liveness/readiness probes.

---

## Key design decisions

**Layered + repository pattern.** Controllers stay thin (HTTP only); services own
all business logic and authorization; repositories abstract data access behind
interfaces, so services depend on `IUserRepository` / `IProjectRepository` rather
than concrete classes — testable with mocks, swappable without business-logic
change.

**Authorization lives in the service layer**, not controllers. If a second entry
path is ever added (background job, gRPC), the ownership rules apply automatically.
Owner-scoped operations treat _not found_ and _not owned_ identically — both
return **404** — so the API never reveals whether another user's resource exists.

**Centralized error handling.** Services throw domain exceptions
(`NotFoundException` → 404, `ConflictException` → 409,
`ForbiddenAccessException` → 403, `UnauthorizedAccessException` → 401); a single
`GlobalExceptionHandler` translates them into RFC 7807 ProblemDetails responses.
Controllers contain no try/catch. (`ForbiddenAccessException` is wired but
currently unused — see `ARCHITECTURE.md`.)

**Security by design.** Passwords are BCrypt-hashed (adaptive cost, built-in
salt, timing-safe verify). JWT validation checks issuer, audience, lifetime, and
signing key on every request. Caller identity always comes from the validated
token, never request bodies. Error messages are deliberately uniform so they
don't confirm which accounts, handles, or resources exist.

**Fail-fast startup.** JWT options bind, validate via data annotations, and run
`ValidateOnStart()`; a missing connection string or JWT secret stops the boot
rather than failing at the first request.

**Scoped DI lifetimes.** All services and repositories are registered scoped
(per-request), matching the `DbContext` lifetime — avoids the concurrency issues
a singleton would cause and the overhead a transient would add.

**Pagination.** List endpoints return a `PagedResult<T>` (items + total + page +
size); `PaginationQuery` caps page size at 50.

---

## What to change before deploying

Three values are environment-specific and must be set for any non-local deploy:

1. **Connection string** — point at the production database.
2. **JWT `Secret` / `Issuer` / `Audience`** — a real secret from a secret store,
   not the development value.
3. **CORS origin** — `Program.cs` currently allows only the React dev server
   (`http://localhost:5173`); replace it with the deployed frontend origin.

---

## Future work

- **Refresh tokens** — pair a short-lived access token with a refresh token
  instead of a single long-lived JWT.
- **Rate limiting** — `POST /api/auth/login` has none; .NET 10's built-in
  `AddRateLimiter` would mitigate brute-force.
- **Unit tests** — every layer depends on interfaces, so the codebase is ready
  for mock-based testing; the tests themselves remain to be written.
