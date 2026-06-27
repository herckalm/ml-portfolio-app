# types/

The frontend's API contract — Zod schemas and the TypeScript types inferred from
them. This is the single source of truth for every request and response shape;
the API client, hooks, forms, and pages all import from here. The TS mirror of
the backend DTOs.

## What's here

A single file, `project.ts`, holding three kinds of thing:

- **Response schemas** — `projectSchema`, `userProfileSchema`, and the
  `pagedResult(...)` wrapper that pages them. These parse what comes off the
  wire. Mirror `ProjectResponseDto` / `UserProfileDto` / `PagedResult<T>`.
- **Request schemas** — `createProjectSchema`, `updateProfileSchema`,
  `publishProjectSchema`. These validate form input _before_ it's sent, so the
  client enforces the same contract the backend will.
- **Shared constants** — `PROJECT_DOMAINS`, the canonical domain list reused by
  the create form, the gallery filter, and the landing page.

## Where parsing happens

These schemas are declared here but _applied_ at the API-client boundary
(`src/lib/api.ts`), where every response is run through `.parse()` before it
reaches a hook. Everything downstream of the client consumes the already-typed,
already-validated result — `createdAt` / `memberSince` arrive as real `Date`
objects, not strings, because the schemas coerce them.

## Conventions worth knowing

- **`gitHubUrl` is lenient, mostly defensively.** `projectSchema.gitHubUrl` is
  `.nullable().optional()`. The `.nullable()` is exact — `ProjectResponseDto`
  declares it `string?` and the backend sends `null` when unset. The `.optional()`
  (tolerating an _absent_ key) guards a state the current contract never produces:
  the API uses default JSON serialization (verified in `Program.cs` — no
  null-omission configured), so the key is always present. So `.optional()` is
  harmless slack, not a deploy-skew strategy, and is safe to drop if you want the
  schema to mirror the DTO exactly. On the _write_ side, `createProjectSchema`
  normalizes an empty string to `undefined` so an untouched optional field is
  omitted from the payload rather than sent as `""`.
- **`null` vs `undefined` is a real distinction here.** The backend sends `null`
  for an empty `bio` (never `undefined`), so `userProfileSchema.bio` is
  `.nullable()`. On the write side, request schemas normalize the _other_
  direction — an empty optional field becomes `undefined` so it's omitted from
  the payload rather than sent as `""`.
- **`domain` is a bare `z.string()`, not an enum.** It _should_ be one of
  `PROJECT_DOMAINS`, but the schema doesn't constrain it — the constraint lives
  in the UI (the filter and form only offer those four values). A candidate for
  tightening to `z.enum(PROJECT_DOMAINS)` later; today it's a convention, not a
  type guarantee. (The same observation the backend made about `Role`.)
- **One schema, two endpoints.** `pagedProjectsSchema` is reused by both the
  owner's list (`GET /api/projects`, all statuses) and the public gallery
  (`GET /api/users/{handle}/projects`, published only) — same shape, same parse,
  different visibility enforced server-side.
