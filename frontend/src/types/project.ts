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
  domain: z.string(), // "NLP", "Computer Vision", ... (was "category")
  modelType: z.string(), // required in the DTO → not optional
  createdAt: z.coerce.date(),
  ownerId: z.number(),
});

export type Project = z.infer<typeof projectSchema>;

export const pagedProjectsSchema = pagedResult(projectSchema);
export type PagedProjects = z.infer<typeof pagedProjectsSchema>;

// UI list for the filter — must match the exact strings you store in Domain.
export const PROJECT_DOMAINS = [
  "NLP",
  "Computer Vision",
  "Classical ML",
  "Deep Learning",
] as const;
export type ProjectDomain = (typeof PROJECT_DOMAINS)[number];
