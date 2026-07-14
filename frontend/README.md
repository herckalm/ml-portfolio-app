# ML Portfolio Hub — Frontend

A portfolio app for ML engineers and researchers: create projects, publish the ones worth showing, and share a single public profile link (`/u/your-handle`) with recruiters and collaborators. Published projects backed by a model show a live "Try it live" demo — text input for NLP models, image upload for CV models.

This is the React frontend. It talks to the .NET backend over a small REST API; all request/response shapes are mirrored locally as Zod schemas.

---

## Stack

- **React + TypeScript**, built with **Vite**
- **Tailwind CSS v4** + **shadcn/ui** for styling and primitives
- **TanStack Query** for server state (caching, invalidation)
- **axios** for transport, **Zod** for runtime validation of every response

Stack versions: React 19, React Router 7, TanStack Query 5, Zod 4, Tailwind v4, Vite 8, TypeScript 6.

---

## Architecture: how a request flows

The frontend is layered, and data flows through those layers in one direction:

Page / component pages/, components/
│ calls a hook
▼
Data-fetching layer src/api/\* ← TanStack Query: caching + invalidation
│ calls a raw method
▼
Transport layer src/lib/api.ts ← axios instance, auth header, error normalization, Zod parse
│
▼
Backend REST API

- **Pages** own page-level state and route params, and are the only place mutations are triggered.
- **`src/api/`** wraps each endpoint in a `useQuery`/`useMutation` hook, owns the query-key hierarchy, and declares what to invalidate after a write.
- **`src/lib/api.ts`** is the single axios instance. It attaches the auth token, normalizes every error into an `ApiError`, and parses every response through its Zod schema — so everything above it receives validated, fully-typed data (dates arrive as real `Date` objects).
- **`src/types/`** holds the Zod schemas those parses use — the contract.

Auth is the one thing that sits outside this flow: `src/auth/AuthContext.tsx` owns login/register (it mints the token the rest of the flow depends on) and the session lifecycle.

---

## Project layout

src/
├── types/ Zod schemas + inferred types — the API contract
├── lib/ axios transport (api.ts) + shared helpers (utils.ts)
├── api/ TanStack Query hooks (the data-fetching layer)
├── auth/ AuthContext: session + auth endpoints
├── components/ reusable UI (layout, projects, predict, generated ui/)
├── pages/ route components (the container layer)
├── App.tsx route table
└── main.tsx app entry (providers: QueryClient, Auth, Router)

Each folder has its own README with the detail; this file is the map and the cross-cutting rules.

---

## Cross-cutting conventions

### Router-state draft-bypass

Draft (unpublished) projects **404 on the public GET** — there is no public way to fetch one by id. So when navigation starts from an owner surface, the **full project object is passed in `location.state`**. The consuming pages — `ProjectDetail` and `ProjectForm` — prefer freshly-fetched data but fall back to that passed object (`data ?? passed`), which is what lets an owner view and edit their own drafts.

### 404-as-signal

A 404 is meaningful domain state, discriminated from real failures via `ApiError.status`:

- `ProjectDetail` — a 404 means draft-or-missing → soft "project not found" view.
- `PublicProfile` — a 404 on the profile means the handle doesn't exist → "user not found" view.

Any non-404 error falls through to a genuine error view.

### The two `api` layers

- **`src/lib/api.ts`** — the axios instance and raw request methods.
- **`src/api/*.ts`** — the TanStack Query hooks that wrap those methods.

Pages call the hooks, never the raw methods.

### Live demo routing

`ProjectDetail` renders a "Try it live" section when a project has a `modelId`. The demo UI is routed by model id prefix: `distilbert-*` → text input (`TextModelDemo`), `vit-*` → image upload (`ImageModelDemo`). Adding a new model type means adding a branch in the `ModelDemo` router component.

### Validation runs on both sides of the wire

The same Zod schemas in `src/types/` validate **responses** (at the transport layer) and **form input** (before submit). A form parses with `safeParse` against the exact schema the backend will enforce, so bad input is caught client-side against the real contract, not a hand-kept duplicate of it.

---

## Known sharp edges

- **Reloading the detail page on your own draft.** The router-state draft-bypass works on navigation from an owner surface, but `location.state` doesn't survive a page reload. If an owner hard-refreshes `/projects/:id` for one of their drafts, the fallback `useProject(id)` hits the public GET, 404s, and the owner sees "not found." A fix would fetch via an authenticated owner-scoped endpoint when `owned` and state is absent.

---

## Development

```bash
npm install
npm run dev      # Vite dev server with HMR → http://localhost:5173
npm run build    # tsc -b then vite build → dist/
npm run preview  # serve the built dist/ locally
npm run lint     # eslint .
```

### Environment

- **`VITE_API_BASE_URL`** — base URL of the backend API. Falls back to `""` (same-origin) when unset. In production this is intentionally left empty: the frontend calls same-origin `/api/...` and nginx reverse-proxies those to the backend. In local dev, set it to `http://localhost:5013`.

---

## Deployment (Fly.io)

The frontend is deployed as `ml-portfolio-web` on Fly.io (region `fra`). It scales to zero (`min_machines_running = 0`, `auto_stop_machines = 'suspend'`) and self-wakes on traffic.

### Docker image

Two-stage build:

- **`build`** (`node:22-slim`) — `npm ci` (cached independently of source), then `npm run build` (`tsc -b && vite build`) → static assets in `/app/dist`.
- **`runtime`** (`nginx:1.27-alpine`) — copies only `dist/` into nginx's web root and the config template into place.

### nginx config

`nginx.conf.template` is env-substituted at container start via `envsubst`. Two responsibilities:

- **SPA serving** — `try_files $uri $uri/ /index.html`, so client-side routes resolve to the app instead of 404ing.
- **API reverse-proxy** — `location /api/` forwards to `${BACKEND_UPSTREAM}` using `${RESOLVER}` for dynamic DNS. Values are injected per environment:
  - Local Compose → `BACKEND_UPSTREAM=http://backend:8080`, `RESOLVER=127.0.0.11`
  - Fly.io → `BACKEND_UPSTREAM=http://ml-portfolio-api.internal:8080`, `RESOLVER=[fdaa::3]`

This is why `VITE_API_BASE_URL` is empty in production — same-origin `/api` calls are proxied here, not sent cross-origin.

### Fly secrets / env

No secrets needed — all config is injected via `fly.toml` `[env]` (the backend URL and DNS resolver). TLS terminates at Fly's edge (`force_https = true`).
