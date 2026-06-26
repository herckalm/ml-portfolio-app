# ML Portfolio App

> A multi-tenant platform where machine-learning practitioners build, manage, and publicly share their project portfolios.

Each user gets a private dashboard to manage their work and a public, shareable page (e.g. `/u/your-handle`) they can hand to a recruiter — no login required to view.

> **Status:** active development — graduation project for the AUEB Coding Factory, built as a full-stack MLOps showcase. The backend and frontend cover the core platform; the ML service is an early scaffold. See the [Roadmap](#roadmap).

## Overview

ML Portfolio App turns a single ML portfolio into a small platform. The backend is a layered ASP.NET Core API with JWT authentication and per-user data ownership; the frontend is a React single-page app; an optional FastAPI service is scaffolded to host illustrative model demos. Projects are private drafts until their owner publishes them, at which point they appear on that owner's public portfolio page.

## Tech stack

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Backend API  | ASP.NET Core 10, EF Core, PostgreSQL                  |
| Auth         | JWT bearer (register / login)                         |
| Frontend     | React + TypeScript (Vite), Tailwind CSS v4, shadcn/ui |
| Data / state | TanStack Query, axios, Zod                            |
| ML service   | FastAPI _(scaffold / planned)_                        |

## Architecture

Three services, with PostgreSQL as the system of record. The ML service is
scaffolded but not yet wired into the request path.

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

The backend follows a clean layered structure:

```
Controllers  → HTTP endpoints, authorization attributes
Services     → business logic, ownership checks, mapping
Repositories → data access (EF Core)
Domain       → entities
DTOs         → request/response contracts (+ PagedResult<T>)
```

Errors are returned as RFC 7807 `problem+json` through a global exception handler. List endpoints return a paged envelope:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20 }
```

Tenancy is row-level: every project carries an `OwnerId`, queries are scoped to the authenticated caller, and cross-tenant access is rejected (returned as _not found_, so a foreign resource's existence is never revealed).

For the full backend design — schema evolution, security posture, layer conventions — see [`backend/README.md`](backend/README.md) and [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).

## Services

| Folder        | Stack                         | Port | Status   |
| ------------- | ----------------------------- | ---- | -------- |
| `/backend`    | ASP.NET Core 10, EF Core, JWT | 5013 | Active   |
| `/frontend`   | React, Vite, TypeScript       | 5173 | Active   |
| `/ml-service` | FastAPI _(planned)_           | 8000 | Scaffold |

## Getting started

### Prerequisites

- .NET 10 SDK
- Node.js 20.19+
- Docker (for PostgreSQL via Compose)

### Database

```bash
docker compose up -d        # starts PostgreSQL
```

### Backend

```bash
cd backend
# configure your connection string and JWT settings via `dotnet user-secrets`
# (appsettings.Development.json holds placeholders only)
dotnet ef database update
dotnet run                  # → http://localhost:5013
```

### Frontend

```bash
cd frontend
npm install
# create a .env file with VITE_API_BASE_URL (leave empty in dev to use the Vite proxy)
npm run dev                 # → http://localhost:5173
```

In development the frontend proxies `/api/*` to the backend on port 5013, so no CORS configuration is needed locally.

## Roadmap

- [x] Layered backend API with JWT auth
- [x] Project CRUD + pagination (`PagedResult<T>`)
- [x] Project ownership (`OwnerId`)
- [x] Frontend foundation (Vite, Tailwind v4, shadcn/ui, API client, typed contracts)
- [x] Multi-tenant scoping — per-user portfolios
- [x] Public, shareable portfolio pages (`/u/:handle`)
- [x] Publish / draft visibility control
- [ ] User dashboard for managing your own projects
- [ ] FastAPI ML demo integration

## Project structure

```
ml-portfolio-app/
├── backend/      ASP.NET Core API (layered: Domain / DTOs / Repositories / Services / Controllers)
├── frontend/     React + TypeScript SPA (Vite)
└── ml-service/   FastAPI ML inference service (scaffold)
```

## ML demos _(planned)_

- [ ] NLP — Text Classification (BERT)
- [ ] Computer Vision — Image Classification
- [ ] Classical ML — Clustering
- [ ] Generative — Prompt Engineering

## License

_TBD — add a license (e.g. MIT) before making the repository public._

## Author

Built by [@herckalm](https://github.com/herckalm) — AUEB Coding Factory graduation project.
