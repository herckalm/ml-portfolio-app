# ML Portfolio App

> A multi-tenant platform where machine-learning practitioners build, manage, and publicly share their project portfolios.

Each user gets a private dashboard to manage their work and a public, shareable page (e.g. `/u/your-handle`) they can hand to a recruiter — no login required to view.

> **Status:** active development — graduation project for the AUEB Coding Factory, built as a full-stack MLOps showcase. Several features below are still in progress; see the [Roadmap](#roadmap).

## Overview

ML Portfolio App turns a single ML portfolio into a small platform. The backend is a layered ASP.NET Core API with JWT authentication and per-user data ownership; the frontend is a React single-page app; an optional FastAPI service hosts illustrative model demos. Projects are private drafts until their owner publishes them, at which point they appear on that owner's public portfolio page.

## Tech stack

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Backend API  | ASP.NET Core 10, EF Core, PostgreSQL                  |
| Auth         | JWT bearer (register / login)                         |
| Frontend     | React + TypeScript (Vite), Tailwind CSS v4, shadcn/ui |
| Data / state | TanStack Query, axios, Zod                            |
| ML service   | FastAPI *(planned / illustrative)*                    |

## Architecture

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

Tenancy is row-level: every project carries an `OwnerId`, queries are scoped to the authenticated caller, and cross-tenant access is rejected.

## Getting started

### Prerequisites

- .NET 10 SDK
- Node.js 20.19+
- PostgreSQL

### Backend

```bash
cd backend
# configure your connection string (appsettings.Development.json or `dotnet user-secrets`)
dotnet ef database update
dotnet run                 # → http://localhost:5013
```

### Frontend

```bash
cd frontend
npm install
# create a .env file with VITE_API_BASE_URL (leave empty in dev to use the Vite proxy)
npm run dev                # → http://localhost:5173
```

In development the frontend proxies `/api/*` to the backend on port 5013, so no CORS configuration is needed locally.

## Roadmap

- [x] Layered backend API with JWT auth
- [x] Project CRUD + pagination (`PagedResult<T>`)
- [x] Project ownership (`OwnerId`)
- [x] Frontend foundation (Vite, Tailwind v4, shadcn/ui, API client, typed contracts)
- [ ] Multi-tenant scoping — per-user portfolios
- [ ] Public, shareable portfolio pages (`/u/:handle`)
- [ ] Publish / draft visibility control
- [ ] User dashboard for managing your own projects
- [ ] FastAPI ML demo integration

## Project structure

```
ml-portfolio-app/
├── backend/    ASP.NET Core API (layered: Domain / DTOs / Repositories / Services / Controllers)
└── frontend/   React + TypeScript SPA (Vite)
```

## License

_TBD — add a license (e.g. MIT) before making the repository public._

## Author

Built by [@herckalm](https://github.com/herckalm) — AUEB Coding Factory graduation project.
    React (Vite + TypeScript)
            │
            ▼
    ASP.NET Core 10  (API Gateway · Auth · CRUD)
            │
            ▼
    FastAPI  (Python · ML inference service)
            │
            ▼
    PostgreSQL  (Docker)

## Services

| Folder       | Stack                          | Port |
|--------------|--------------------------------|------|
| `/backend`   | ASP.NET Core 10, EF Core, JWT  | 5013 |
| `/ml-service`| FastAPI, uv, PyTorch           | 8000 |
| `/frontend`  | React, Vite, TypeScript        | 5173 |

## Quick Start

    docker compose up -d                         # PostgreSQL
    cd backend && dotnet run                     # .NET API
    cd ml-service && uv run fastapi dev main.py  # FastAPI
    cd frontend && npm run dev                   # React

## ML Demos

- [ ] NLP — Text Classification (BERT)
- [ ] Computer Vision — Image Classification
- [ ] Classical ML — Clustering
- [ ] Generative — Prompt Engineering
