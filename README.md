# ML Portfolio

> Full-stack ML engineering portfolio — ASP.NET Core 10 · FastAPI · React · PostgreSQL

## Architecture

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
