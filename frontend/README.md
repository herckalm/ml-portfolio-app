# ML Portfolio Hub — Frontend

A portfolio app for ML engineers and researchers: create projects, publish the
ones worth showing, and share a single public profile link (`/u/your-handle`)
with recruiters and collaborators.

This is the React frontend. It talks to the .NET backend over a small REST API;
all request/response shapes are mirrored locally as Zod schemas.

## Stack

- **React + TypeScript**, built with **Vite**
- **Tailwind CSS v4** + **shadcn/ui** for styling and primitives
- **TanStack Query** for server state (caching, invalidation)
- **axios** for transport, **Zod** for runtime validation of every response

## Architecture: how a request flows

The frontend is layered, and data flows through those layers in one direction.
Reading a request top to bottom:
Page / component pages/, components/

│ calls a hook

▼

Data-fetching layer src/api/\* ← TanStack Query: caching + invalidation

│ calls a raw method

▼

Transport layer src/lib/api.ts ← axios instance, auth header, error

│ axios request normalization, Zod parse

▼

Backend REST API

- **Pages** own page-level state and route params, and are the only place
  mutations are triggered.
- **`src/api/`** wraps each endpoint in a `useQuery`/`useMutation` hook, owns the
  query-key hierarchy, and declares what to invalidate after a write.
- **`src/lib/api.ts`** is the single axios instance. It attaches the auth token,
  normalizes every error into an `ApiError`, and parses every response through
  its Zod schema — so everything above it receives validated, fully-typed data
  (dates arrive as real `Date` objects).
- **`src/types/`** holds the Zod schemas those parses use — the contract.

Auth is the one thing that sits outside this flow: `src/auth/AuthContext.tsx`
owns login/register (it mints the token the rest of the flow depends on) and the
session lifecycle.

## Project layout

src/

├── types/ Zod schemas + inferred types — the API contract → types/README.md

├── lib/ axios transport (api.ts) + shared helpers (utils.ts) → lib/README.md

├── api/ TanStack Query hooks (the data-fetching layer) → api/README.md

├── auth/ AuthContext: session + auth endpoints → auth/README.md

├── components/ reusable UI (layout, projects, generated ui/) → components/README.md

├── pages/ route components (the container layer) → pages/README.md

├── App.tsx route table

└── main.tsx app entry (providers: QueryClient, Auth, Router)

Each folder has its own README with the detail; this file is the map and the
cross-cutting rules.

## Cross-cutting conventions

The patterns that span folders and are easy to miss reading any single file.

### Router-state draft-bypass

The most load-bearing idea in the frontend. Draft (unpublished) projects **404 on
the public GET** — there's no public way to fetch one by id. So when navigation
starts from an owner surface (a card on the dashboard, the owner band on a detail
page), the **full project object is passed in `location.state`**. The consuming
pages — `ProjectDetail` and `ProjectForm` — prefer freshly-fetched data but fall
back to that passed object (`data ?? passed`), which is exactly what lets an owner
view and edit their own drafts. (See _Known sharp edges_ for where this falls
down.)

### 404-as-signal

A 404 isn't only an error here — it's meaningful domain state, discriminated from
real failures via `ApiError.status`:

- `ProjectDetail` — a 404 means draft-or-missing → soft "project not found" view.
- `PublicProfile` — a 404 on the profile means the handle doesn't exist → "user
  not found" view.

Any _non_-404 error falls through to a genuine error view. This is why pages
check `err.status === 404` rather than treating all failures alike.

### The two `api` layers

There are two things named "api"; they are different layers and shouldn't be
conflated:

- **`src/lib/api.ts`** — the axios instance and raw request methods.
- **`src/api/*.ts`** — the TanStack Query hooks that _wrap_ those methods.

Pages call the hooks, never the raw methods.

### Query keys and invalidation

Cache keys are built from hierarchical factories (`projectKeys`, `userKeys`), and
mutations invalidate the narrowest key prefix that covers what they changed.
Stated in full — including the per-mutation invalidation table — in
`src/api/README.md`.

### Validation runs on both sides of the wire

The same Zod schemas in `src/types/` validate **responses** (at the transport
layer) and **form input** (before submit). A form parses with `safeParse` against
the exact schema the backend will enforce, so bad input is caught client-side
against the real contract, not a hand-kept duplicate of it.

### A note on `gitHubUrl` validation

`projectSchema.gitHubUrl` is `.nullable().optional()`. The `.nullable()` matches
the contract exactly — `ProjectResponseDto.GitHubUrl` is `string?` and the backend
sends `null` when unset. The `.optional()` is defensive only: the API uses default
JSON serialization (no null-omission configured in `Program.cs`), so the key is
always present and the absent-key case `.optional()` guards never actually occurs.
Harmless, but not load-bearing — it is **not** a general "schemas absorb backend
drift" policy, just one lenient field. (Full reasoning in `src/types/README.md`.)

## Known sharp edges

Documented, not yet fixed — the frontend equivalent of the backend README's
"convention, not a constraint" callouts.

- **Reloading the detail page on your own draft.** The router-state draft-bypass
  works on _navigation_ from an owner surface, but `location.state` doesn't
  survive a page reload. If an owner hard-refreshes `/projects/:id` for one of
  their **drafts**, the fallback `useProject(id)` hits the public GET, 404s, and
  the owner sees their own draft as "not found." `ProjectForm` handles the same
  situation explicitly (it shows a "start the edit from your dashboard" message);
  `ProjectDetail` degrades silently. A fix would fetch via an authenticated
  owner-scoped endpoint when `owned` and state is absent.

## Development

```bash
npm install
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b (type-check via project refs) then vite build → dist/
npm run preview  # serve the built dist/ locally
npm run lint     # eslint .
```

Stack versions of note: **React 19**, **React Router 7**, **TanStack Query 5**,
**Zod 4** (note: `z.flattenError(...)` is the Zod-4 form-error API, used in the
form pages), **Tailwind v4** (via `@tailwindcss/vite`), and **Vite 8** /
**TypeScript 6**.

### Environment

- **`VITE_API_BASE_URL`** — base URL of the backend API. Falls back to `""`
  (same-origin) when unset. In production this is intentionally left empty: the
  frontend calls same-origin `/api/...` and **nginx reverse-proxies those to the
  backend** (see Deployment). In local dev, set it to the backend's dev origin
  (the backend runs on `http://localhost:5013`).

### Deployment

Built and served by a two-stage Docker image; the same image runs under Docker
Compose locally and on Fly.io in production.

- **`Dockerfile`** — multi-stage:
  - **`build`** (`node:22-slim`) — `npm ci` from the manifests (cached
    independently of source), then `npm run build` (`tsc -b && vite build`) →
    static assets in `/app/dist`.
  - **`runtime`** (`nginx:1.27-alpine`) — copies only `dist/` into nginx's web
    root and the config template into place. Runs nginx in the foreground as
    PID 1; container `HEALTHCHECK` polls `/`.
- **`nginx.conf.template`** — env-substituted at container start (`envsubst`).
  Two responsibilities:
  - **SPA serving** — `try_files $uri $uri/ /index.html`, so client-side routes
    resolve to the app instead of 404ing.
  - **API reverse-proxy** — `location /api/` forwards to `${BACKEND_UPSTREAM}`,
    which (with `${RESOLVER}`) is injected per environment from the same template:
    Compose → `http://backend:8080` (resolver `127.0.0.11`); Fly →
    `http://ml-portfolio-api.internal:8080` over 6PN (resolver `[fdaa::3]`). This
    is why `VITE_API_BASE_URL` is empty in production — same-origin `/api` calls
    are proxied here, not sent cross-origin.
- **`fly.toml`** — app `ml-portfolio-web`, region `fra` (same as the backend, so
  the internal hop is fast), `build_target = 'runtime'`. nginx listens on 80; TLS
  terminates at Fly's edge (`force_https`). Scales to zero
  (`min_machines_running = 0`, `auto_stop_machines = 'suspend'`) and self-wakes
  on traffic.

### Tooling notes

ESLint is configured in `eslint.config.js`. For stricter, type-aware lint rules
(`recommendedTypeChecked` / `strictTypeChecked`) and React-specific plugins, see
the Vite React-TS template guidance the original README linked.

