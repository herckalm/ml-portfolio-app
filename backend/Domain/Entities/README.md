# Domain/Entities

The persistent domain model — plain C# entity classes that map to database
tables via EF Core. These are the foundation the rest of the backend is built
on; DTOs, repositories, and services all reference them.

## Entities

**`User`** — an application account. Carries authentication state (email,
password hash, role) and a public profile (handle, display name, bio). Addressed
three ways depending on context: by **email** for auth, by **handle** for the
public profile at `/u/{handle}`, and by **id** for the owner's own operations.

**`Project`** — a portfolio project. The core showcase entity. Starts as an
owner-only draft (`IsPublished = false`) and becomes publicly visible once
published. Every project belongs to exactly one user.

## The one relationship

`User` 1-to-many `Project`, bidirectional (`User.Projects` ↔ `Project.Owner` /
`Project.OwnerId`). Deleting a user cascades to their projects. The entity
classes declare the navigation properties, but the relationship, its cascade
behavior, and all column constraints are configured in `AppDbContext`
(`Infrastructure/Data`) — that's the schema source of truth, not these classes.

## Conventions worth knowing

- **`null!` on `Project.Owner`** asserts EF will populate the navigation on load;
  it suppresses the nullable warning, not an actual nullability guarantee.
- **Collection navigations are initialized empty** (`new List<Project>()`) so
  they're safe to add to before persistence.
- **`Handle` is stored lowercase.** This is an invariant enforced upstream (in
  `AuthService` / `HandleGenerator` on write) and relied on downstream (in
  `UserRepository`'s normalized lookups). The entity itself doesn't enforce it.
- **`Role` is a bare string** (`"user"` / `"admin"`), not an enum. A candidate
  for tightening later; today it's a convention, not a type constraint.
