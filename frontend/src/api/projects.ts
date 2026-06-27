/**
 * TanStack Query hooks for projects — the data-fetching layer. Each hook wraps a
 * raw method from `@/lib/api` (`projectsApi` / `usersApi`) and adds caching,
 * cache-key identity, and (for mutations) invalidation.
 *
 * Invalidation strategy lives here, in one place, so pages never re-implement it:
 *   - Query keys are hierarchical (see {@link projectKeys}). A mutation
 *     invalidates the *narrowest prefix* that covers what it changed, and every
 *     key nested under that prefix is refetched.
 *   - `mineRoot()` covers all pages of the owner's list; invalidating it refetches
 *     the dashboard regardless of which page is showing.
 *   - `all` covers everything (mine + every public gallery + details); used when a
 *     change can be visible in more than just the owner's own list.
 *   - Where the server returns the updated entity, the detail cache is written
 *     through with `setQueryData` (no refetch) and only the *lists* are invalidated.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { projectsApi, usersApi } from "@/lib/api";
import type { CreateProjectInput, UpdateProjectInput } from "@/types/project";

/**
 * Query-key factory. The nesting is the contract the invalidation logic relies on:
 * every key starts with `all`, the owner's pages nest under `mineRoot()`, so
 * invalidating a prefix cascades to everything beneath it. Always build keys
 * through this object — a hand-written array that doesn't match a prefix silently
 * escapes invalidation.
 */
export const projectKeys = {
  all: ["projects"] as const,
  mineRoot: () => [...projectKeys.all, "mine"] as const,
  mine: (page: number, pageSize: number) =>
    [...projectKeys.mineRoot(), { page, pageSize }] as const,
  byUser: (handle: string, page: number, pageSize: number) =>
    [...projectKeys.all, "user", handle, { page, pageSize }] as const,
  detail: (id: number) => [...projectKeys.all, "detail", id] as const,
};

// ── queries ──────────────────────────────────────────────────────────────

/** Owner's dashboard list (auth, all statuses). `keepPreviousData` holds the
 *  current page on screen while the next one loads, avoiding a flash to empty. */
export function useMyProjects(page = 1, pageSize = 10) {
  return useQuery({
    queryKey: projectKeys.mine(page, pageSize),
    queryFn: () => projectsApi.getMine(page, pageSize),
    placeholderData: keepPreviousData,
  });
}

/** Public published-only gallery at `/u/:handle`. */
export function useUserProjects(
  handle: string | undefined,
  page = 1,
  pageSize = 10,
) {
  return useQuery({
    queryKey: projectKeys.byUser(handle ?? "", page, pageSize),
    queryFn: () => usersApi.getProjects(handle!, page, pageSize),
    enabled: !!handle, // hold until the router resolves :handle (then handle! is safe)
    placeholderData: keepPreviousData,
  });
}

/** Single project detail (public, published only). */
export function useProject(id: number | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? -1), // -1 is an unused placeholder; `enabled` blocks the fetch
    queryFn: () => projectsApi.getById(id!),
    enabled: id != null,
  });
}

// ── mutations ────────────────────────────────────────────────────────────

/** Create (form-bound). Only the owner's list can change, so invalidate just
 *  `mineRoot()` — public galleries can't show a brand-new draft. */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.mineRoot() }),
  });
}

/** Update (form-bound). Writes the fresh entity straight into the detail cache,
 *  then invalidates the owner's lists to reflect changed title/etc. */
export function useUpdateProject(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => projectsApi.update(id, input),
    onSuccess: (updated) => {
      qc.setQueryData(projectKeys.detail(id), updated);
      qc.invalidateQueries({ queryKey: projectKeys.mineRoot() });
    },
  });
}

/** Publish/unpublish (list-bound, one button per card). Invalidates `all`
 *  because a visibility flip changes both the owner's list *and* what public
 *  galleries show. */
export function usePublishProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPublished }: { id: number; isPublished: boolean }) =>
      projectsApi.setPublished(id, isPublished),
    onSuccess: (updated) => {
      qc.setQueryData(projectKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

/** Delete. Removes the now-dead detail cache outright (it would 404), then
 *  invalidates `all` since the row vanishes from every list it appeared in. */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.remove(id),
    onSuccess: (_void, id) => {
      qc.removeQueries({ queryKey: projectKeys.detail(id) });
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
