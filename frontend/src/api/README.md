# api/

The data-fetching layer: TanStack Query hooks that wrap the raw request methods
from `src/lib/api.ts` and add caching, cache-key identity, and invalidation. This
is what pages and components actually call — never the raw `projectsApi` /
`usersApi` methods directly.

Two files, one per resource: `projects.ts` and `users.ts`.

## The layering

component / page

└─ useMyProjects(), useCreateProject(), … ← src/api/\* (this folder)

└─ projectsApi.getMine(), … ← src/lib/api.ts

└─ axios + Zod parse ← the wire

Each hook is thin: it names a query key, points at a `lib/api` method, and (for
mutations) declares what to invalidate on success. All the transport concerns —
auth header, error normalization, response validation — already happened one
layer down.

## Query keys are the contract

Every key is built through a factory (`projectKeys`, `userKeys`), never
hand-written at a call site. The factories produce **hierarchical** keys, and
that hierarchy is load-bearing: invalidating a prefix cascades to every key
nested under it.

["projects"] ← projectKeys.all

["projects", "mine"] ← mineRoot()

["projects", "mine", { page, pageSize }] ← mine(page, pageSize)

["projects", "user", handle, { page, pageSize }]← byUser(...)

["projects", "detail", id] ← detail(id)

Because `mine(...)` nests under `mineRoot()`, invalidating `mineRoot()` refetches
the dashboard regardless of which page is showing. Invalidating `all` refetches
everything — the owner's list _and_ every public gallery _and_ details. A
hand-built array that doesn't match a prefix silently escapes invalidation, which
is why keys only ever come from the factory.

## Invalidation strategy

Each mutation invalidates the **narrowest prefix** that covers what it changed:

| Mutation            | On success                                   | Why that scope                                                                 |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `useCreateProject`  | invalidate `mineRoot()`                      | a new draft can only appear in the owner's own list                            |
| `useUpdateProject`  | write detail cache + invalidate `mineRoot()` | edited fields show in the owner's list; detail is seeded from the returned DTO |
| `usePublishProject` | write detail cache + invalidate `all`        | a visibility flip changes both the owner's list and public galleries           |
| `useDeleteProject`  | remove detail cache + invalidate `all`       | the row vanishes everywhere it appeared                                        |
| `useUpdateProfile`  | write profile cache + invalidate `users.all` | refetches the public profile at `/u/:handle`                                   |
| `useDeleteAccount`  | **nothing**                                  | see below                                                                      |

Where the server returns the updated entity, the detail/profile cache is written
through with `setQueryData` (no refetch) and only the _lists_ are invalidated —
cheaper than refetching a record we already hold fresh.

## Two deliberate non-obvious choices

- **`useDeleteAccount` does no cache work.** Its caller (Settings → Danger Zone)
  runs `logout()` on success, which calls `queryClient.clear()` and wipes the
  entire cache. Doing cache surgery in the hook would be redundant and could race
  that teardown, so the hook intentionally leaves it alone.
- **Queries gate on `enabled`.** Hooks that depend on a router param
  (`useUserProjects`, `useProject`, `useUserProfile`) stay idle until the param
  resolves (`enabled: !!handle` / `id != null`), so they never fire with a
  placeholder key. List queries also use `placeholderData: keepPreviousData` to
  hold the current page on screen while the next loads, avoiding a flash to empty.

## Convention

`users.ts` follows the exact same key-factory and invalidation discipline as
`projects.ts`; the rationale is documented once here rather than repeated in both
files.
