# Controllers

The HTTP layer. Thin ASP.NET Core controllers that map routes to service calls,
translate the result to status codes, and do nothing else — no business logic, no
data access. Each action calls a service interface and returns a DTO. Errors are
thrown as domain exceptions and turned into responses by the `GlobalExceptionHandler`
(`Middleware`), so controllers contain no try/catch.

## Endpoints

**`AuthController`** (`api/auth`) — anonymous. `POST register`, `POST login`.
Both return an `AuthResponse` (JWT + identity). No `[Authorize]` by design: these
are how a caller obtains a token.

**`ProjectsController`** (`api/projects`) — mixed access.

- `GET /` — authenticated; the caller's own projects (drafts included), paged.
- `GET /{id}` — public; published only (draft or missing id → 404).
- `POST /` — authenticated; create.
- `PUT /{id}` — owner only; full update.
- `PATCH /{id}/publish` — owner only; toggle publish state.
- `DELETE /{id}` — owner only.

**`UsersController`** (`api/users`) — two tiers.

- `GET /{handle}` — public profile.
- `GET /{handle}/projects` — public; that user's published projects, paged.
- `PUT /me` — authenticated; update own profile.
- `DELETE /me` — authenticated; hard-delete own account.

## Conventions

These hold across every controller and are the main thing to preserve when adding
endpoints:

- **Caller identity always comes from the validated JWT, never the request body
  or route.** The user id is read from the `NameIdentifier` claim (via a private
  `CurrentUserId()` helper, or inline in `UsersController`). A client cannot act
  as another user by changing a payload field.
- **Cross-tenant access returns 404, not 403.** Owner-scoped operations on a
  project you don't own are indistinguishable from operations on one that doesn't
  exist — the API never reveals a foreign resource's existence. This is enforced
  in the service layer; don't "correct" it to a 403.
- **Controllers stay thin.** If an action grows logic beyond shape-checking and
  delegating, that logic belongs in a service.

## A consistency note

`UsersController` uses an explicit `[Route("api/users")]` while `ProjectsController`
uses the token form `[Route("api/[controller]")]`. Both resolve correctly
(`api/users`, `api/projects`); the token form is preferred except where the
literal reads clearer.
