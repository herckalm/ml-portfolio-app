import { z } from "zod";

// generic wrapper for any endpoint returning { items, total, page, pageSize }.
// This is the TS mirror of my backend's PagedResult<T>.
export function pagedResult<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

// matches ProjectResponseDto
export const projectSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  domain: z.string(), // "NLP", "Computer Vision", ...
  modelType: z.string(),
  createdAt: z.coerce.date(),
  ownerId: z.number(),
  isPublished: z.boolean(),
});

export type Project = z.infer<typeof projectSchema>;

// reused by BOTH GET /api/projects (mine, all statuses) and
// GET /api/users/{handle}/projects (public, published only) — same T, same shape.
export const pagedProjectsSchema = pagedResult(projectSchema);
export type PagedProjects = z.infer<typeof pagedProjectsSchema>;

// matches UserProfileDto — GET /api/users/{handle} and the PUT /api/users/me response
export const userProfileSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(), // contract says string|null — the backend sends null, not undefined
  memberSince: z.coerce.date(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

// POST /api/projects → 201 draft
export const createProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().min(1),
  modelType: z.string().min(1),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// PUT /api/projects/{id} — same editable fields as create
export type UpdateProjectInput = CreateProjectInput;

// PATCH /api/projects/{id}/publish
export const publishProjectSchema = z.object({ isPublished: z.boolean() });
export type PublishProjectInput = z.infer<typeof publishProjectSchema>;

// PUT /api/users/me  (bio? in the contract → optional + nullable)
export const updateProfileSchema = z.object({
  displayName: z.string().min(1),
  bio: z.string().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// UI list for the filter — must match the exact strings you store in Domain.
export const PROJECT_DOMAINS = [
  "NLP",
  "Computer Vision",
  "Classical ML",
  "Deep Learning",
] as const;
export type ProjectDomain = (typeof PROJECT_DOMAINS)[number];
