/**
 * Zod schemas and inferred types for the project/profile API contract.
 *
 * This is the frontend's single source of truth for response and request
 * shapes — the TS mirror of the backend DTOs. Each schema is annotated with the
 * endpoint and DTO it corresponds to. Runtime parsing happens at the API-client
 * boundary (`src/api/*`); everything downstream consumes the inferred types.
 *
 * Convention: schemas validate what crosses the wire. Where a schema is more
 * lenient than the DTO (see `gitHubUrl`), that leniency is called out as such —
 * it is not a general "absorb arbitrary backend drift" policy.
 */
import { z } from "zod";

/**
 * Builds a schema for any paginated endpoint returning
 * `{ items, total, page, pageSize }`. TS mirror of the backend's
 * `PagedResult<T>`; pass the item schema and get the page wrapper back.
 *
 * @example
 * const pagedProjects = pagedResult(projectSchema);
 */
export function pagedResult<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

/** Structural type for a page of results. Mirror of {@link pagedResult}'s output. */
export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** A single project as returned by the API. Mirrors `ProjectResponseDto`. */
export const projectSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  domain: z.string(), // one of PROJECT_DOMAINS; not enum-constrained here (see Domain note)
  modelType: z.string(),
  // Matches ProjectResponseDto.GitHubUrl (string?). The backend always sends the
  // key — default JSON serialization, no null-omission configured in Program.cs —
  // so a null arrives as `"gitHubUrl": null`, never an absent key. That makes
  // .nullable() the load-bearing modifier. .optional() is harmless defensive slack
  // for an absent-key case the current contract never emits; safe to drop if you
  // want the schema to mirror the DTO exactly.
  gitHubUrl: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  ownerId: z.number(),
  isPublished: z.boolean(),
});

export type Project = z.infer<typeof projectSchema>;

/**
 * Page-of-projects schema, reused by **both** consumers of the same shape:
 * `GET /api/projects` (owner's own, all statuses) and
 * `GET /api/users/{handle}/projects` (public, published only).
 */
export const pagedProjectsSchema = pagedResult(projectSchema);
export type PagedProjects = z.infer<typeof pagedProjectsSchema>;

/**
 * Public profile. Mirrors `UserProfileDto` — the response shape for both
 * `GET /api/users/{handle}` and `PUT /api/users/me`.
 */
export const userProfileSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(), // contract is string|null — backend sends null, never undefined
  memberSince: z.coerce.date(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/** Request body for `POST /api/projects` → 201 draft. */
export const createProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().min(1),
  modelType: z.string().min(1),
  /**
   * Accepts a valid URL or empty string, then normalizes `""` → `undefined` so
   * an untouched optional field is omitted from the payload rather than sent as
   * an empty string the backend would have to special-case.
   */
  gitHubUrl: z
    .url("Enter a valid URL (https://github.com/…)")
    .or(z.literal(""))
    .optional()
    .transform((v) => v || undefined),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Body for `PUT /api/projects/{id}` — same editable fields as create. */
export type UpdateProjectInput = CreateProjectInput;

/** Body for `PATCH /api/projects/{id}/publish`. */
export const publishProjectSchema = z.object({ isPublished: z.boolean() });
export type PublishProjectInput = z.infer<typeof publishProjectSchema>;

/** Body for `PUT /api/users/me`. `bio` is optional+nullable per the contract. */
export const updateProfileSchema = z.object({
  displayName: z.string().min(1),
  bio: z.string().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Domain values for the UI filter. Must stay in exact string-sync with the
 * `Domain` values persisted by the backend — these are the contract, not a
 * display-only convenience.
 */
export const PROJECT_DOMAINS = [
  "NLP",
  "Computer Vision",
  "Classical ML",
  "Deep Learning",
] as const;
export type ProjectDomain = (typeof PROJECT_DOMAINS)[number];
