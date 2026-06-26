# DTOs

Data transfer objects — the API's contract boundary. These are the shapes that
cross the wire; controllers speak DTOs, never entities. Inbound DTOs carry
validation attributes (enforced by the framework before a request reaches a
service); outbound DTOs are flattened projections of entities.

## Layout

The root namespace holds the feature DTOs; `DTOs/Common` holds the
pagination primitives shared across list endpoints.

**Auth** (`AuthDtos.cs`) — `RegisterRequest`, `LoginRequest`, and the
`AuthResponse` returned by both (JWT + public identity).

**Projects** (`ProjectDtos.cs`) — `CreateProjectDto` and `UpdateProjectDto`
(inbound, field-identical), `SetPublishedDto` (publish toggle, deliberately
separate from edits), and `ProjectResponseDto` (outbound).

**Users** (`UserDtos.cs`) — `UserProfileDto` (public profile projection) and
`UpdateProfileDto` (self-service edit).

**Common** (`DTOs/Common`) — `PaginationQuery` (inbound page/size) and
`PagedResult<T>` (outbound page + metadata).

## Conventions

- **Inbound DTOs validate via data annotations.** A malformed payload is rejected
  with a 400 by the framework before any service runs — services can assume
  shape-valid input.
- **Outbound DTOs never expose sensitive or navigation fields.** `ProjectResponseDto`
  carries `OwnerId` but not the `Owner` object; `UserProfileDto` carries only
  public identity — never email, role, id, or password hash.
- **`PaginationQuery.PageSize` is clamped** to a max of 50 (the cap is an upper
  bound only; values at or below it, including non-positive ones, pass through).

## Intentional asymmetries (entity vs. DTO)

These look like inconsistencies in a diff but are deliberate:

- **`ModelType` is `[Required]` on `CreateProjectDto` but nullable on the
  `Project` entity.** The create contract is stricter than storage — projects made
  through the API always have a model type, though the schema permits null rows.
- **`CreatedAt` → `MemberSince`.** The only entity field renamed in its DTO;
  surfaced on `UserProfileDto` as a public "member since" value.
- **`Handle` is absent from `UpdateProfileDto`.** Its omission is the mechanism
  that makes handles immutable after registration — there's no endpoint to change
  one. Don't "helpfully" add it back.
