# pages/

The route components — one per screen, each the top of a route tree. Pages are
the **container** layer: they call the data hooks from `src/api/`, own page-level
state (current page, form values), resolve router params, and compose the
presentational components from `src/components/`. They're also the only place the
mutation hooks are invoked.

## Routes

| File            | Route                                 | Auth     | Notes                                              |
| --------------- | ------------------------------------- | -------- | -------------------------------------------------- |
| `Home`          | `/`                                   | public   | Auth-aware hero. No project feed — see below.      |
| `Login`         | `/login`                              | public   | Redirects back to the intended page after login.   |
| `Register`      | `/register`                           | public   | Also logs the user in on success.                  |
| `Dashboard`     | `/dashboard`                          | auth     | Owner's project list; calls the project mutations. |
| `ProjectDetail` | `/projects/:id`                       | public\* | \*Owner can view their own draft — see idioms.     |
| `ProjectForm`   | `/projects/new`, `/projects/:id/edit` | auth     | One component, create + edit modes.                |
| `PublicProfile` | `/u/:handle`                          | public   | Public read-side counterpart to Dashboard.         |
| `Settings`      | `/settings`                           | auth     | Profile edit + account deletion.                   |
| `NotFound`      | `*`                                   | public   | Route-level 404, inside the layout.                |

## Where the mutation hooks are called

Mutations live in `src/api/` but are only _invoked_ from two pages:

- **`Dashboard`** (via its `ProjectActions`) — publish, delete.
- **`ProjectDetail`** — publish, delete (owner band).
- **`ProjectForm`** — create, update.
- **`Settings`** — update profile, delete account.

Everywhere else is reads. This is the layer that turns user intent into writes;
the cache invalidation that follows is handled by the hooks themselves
(see `src/api/README.md`).

## Two cross-cutting idioms appear here

Both are stated authoritatively in the top-level `frontend/README.md`; named here
because this is where a reader meets them:

- **Router-state draft-bypass.** Drafts 404 on the public GET, so owner surfaces
  pass the full project in `location.state`. `ProjectDetail` and `ProjectForm`
  both prefer fetched data but fall back to the passed project
  (`data ?? passed`), which is what lets an owner open or edit their own draft.
- **404-as-signal.** A 404 is treated as meaningful domain state, not just an
  error: a draft/missing project (`ProjectDetail`) or an unknown handle
  (`PublicProfile`) renders a soft "not found" view, discriminated from real
  failures via `ApiError.status`.

## One structural note

There is no "all published projects" page, because the contract has no global
endpoint for it (`GET /api/projects` is the caller's own; the public list is
per-handle). `Home` is therefore a hero, not a feed — the only paths to projects
are a user's own dashboard or a specific `/u/:handle`.

## Patterns shared across the form pages

`ProjectForm` and `Settings` use the same container/view split: the page resolves
data and mode, an inner view component owns the controlled form and seeds its
state once from `initial` (keyed so it remounts cleanly between records). Both
validate with the shared Zod schema from `src/types/` before sending, so the
client enforces the same contract the backend will.
