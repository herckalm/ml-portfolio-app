# Services

The business-logic layer between controllers and repositories. Services own the
use-cases, the authorization rules, and the entity↔DTO mapping. Controllers call
service interfaces and get DTOs back; services orchestrate repositories and never
leak entities outward.

## Contents

**`IAuthService` / `AuthService`** — registration and login. Hashes passwords
(BCrypt), issues tokens (`JwtService`), and owns handle resolution.

**`IProjectService` / `ProjectService`** — project use-cases, pagination, and the
owner-scoped authorization rule. Depends on the user repository only to resolve a
handle to an owner id for the public listing.

**`IUserService` / `UserService`** — the public profile read and the caller's own
profile update/delete.

**`JwtService`** — issues signed JWTs from `JwtOptions`; stamps user id, email,
and role into claims. (Not interface-backed — it's a leaf utility with no
alternate implementation.)

**`HandleGenerator`** — stateless static helper: normalizes arbitrary text into a
valid slug and screens the reserved-word set. Shape and reservations only; the
uniqueness loop lives in `AuthService` because it needs the repository.

## Security posture

The services are where a deliberate, repeated pattern lives: **uniform error
messages that don't leak which accounts, handles, or resources exist.** Three
instances, same principle:

- **Login** returns "Invalid credentials." whether the email is unknown or the
  password is wrong.
- **Handle selection** returns "That handle isn't available." whether the handle
  is reserved or already taken.
- **Owner-scoped project operations** (update/publish/delete) treat _not found_
  and _not yours_ identically — both surface as `NotFoundException` (→ 404), so
  the API never confirms a foreign project's existence. `ForbiddenAccessException`
  exists and is wired to 403 in the handler, but **no current code path throws
  it** — cross-tenant access uses not-found instead.

## Conventions & notes

- **Handles are lowercased on every write path** here — explicit ones via
  `Trim().ToLowerInvariant()`, derived ones via `HandleGenerator.Normalize`. This
  is the write end of the cross-layer invariant the repository's lookups depend on.
- **Input trimming.** Display names and bios are trimmed; a blank bio is
  normalized to `null`.
- **Hard deletes.** Account deletion removes the row; projects are cleaned up by
  the database FK cascade, not by application code.
- **`MakeUniqueAsync` is an O(n)-queries suffix loop** in the number of
  collisions. Fine at portfolio scale (collisions on a derived slug are rare);
  revisit if registration volume grows.
