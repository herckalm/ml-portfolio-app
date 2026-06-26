# Repositories

The data-access layer between services and EF Core. Each repository wraps
`AppDbContext` and exposes a focused, intention-revealing API (interface +
implementation pair per aggregate). Services depend on the interfaces, never on
the context directly.

## Contents

**`IUserRepository` / `UserRepository`** — lookups by the three identities a user
is addressed by (email, handle, id), existence checks, and create/update/delete.

**`IProjectRepository` / `ProjectRepository`** — owner-scoped and public
(published-only) reads, plus create/update/delete. Paging is centralized in a
private helper that returns the page and the unpaged total together.

## Conventions

These two distinctions run through both repositories and are the main thing to
understand before editing:

- **Tracked vs. untracked reads.** Methods whose result will be _mutated_
  (`GetByIdAsync` on either repo) return a **tracked** entity, so the matching
  `UpdateAsync` is just `SaveChangesAsync()` with no explicit `Update()` call —
  EF emits an UPDATE for only the changed columns. Read-only paths use
  `AsNoTracking()` for less overhead. Don't add `AsNoTracking` to a method that
  feeds a mutation, and don't mutate the result of an untracked read expecting it
  to persist.
- **Owner-scoped vs. public reads.** The `...ByOwner` methods return everything;
  the `Published...` variants apply the `IsPublished` filter in SQL. The
  authorization decision (is this caller allowed to see drafts?) is made in the
  _service_ by choosing which method to call — the repository just executes.

## Correctness notes

- **Handle lookups normalize** (`Trim().ToLowerInvariant()`) before querying,
  because handles are stored lowercase. This is one end of a cross-layer invariant
  also enforced on write in `AuthService`/`HandleGenerator`; breaking either side
  silently breaks lookups.
- **`UserRepository.CreateAsync` is the race-safe uniqueness authority.** It
  catches the Postgres unique-violation (`23505`) and translates it to a
  `ConflictException`, inspecting the constraint name for a specific message. The
  `ExistsBy...` methods are friendly _pre-checks_ for clean error messages, but
  the DB constraint caught here is what actually closes the check-then-insert race
  between two concurrent registrations.
- **Email lookup is tracked, handle lookup is untracked** — intentional, since
  email feeds identity/login flows that may mutate, while handle feeds the public
  read. The asymmetry is invisible without reading both methods, hence this note.
