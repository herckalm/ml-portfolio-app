import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { projectsApi, usersApi } from "@/lib/api";
import type { CreateProjectInput, UpdateProjectInput } from "@/types/project";

export const projectKeys = {
  all: ["projects"] as const,
  mineRoot: () => [...projectKeys.all, "mine"] as const,
  mine: (page: number, pageSize: number) =>
    [...projectKeys.mineRoot(), { page, pageSize }] as const,
  byUser: (handle: string, page: number, pageSize: number) =>
    [...projectKeys.all, "user", handle, { page, pageSize }] as const,
  detail: (id: number) => [...projectKeys.all, "detail", id] as const,
};

// queries

// /dashboard — my projects (AUTH, all statuses).
export function useMyProjects(page = 1, pageSize = 10) {
  return useQuery({
    queryKey: projectKeys.mine(page, pageSize),
    queryFn: () => projectsApi.getMine(page, pageSize),
    placeholderData: keepPreviousData, // keep old page on screen while next loads
  });
}

// /u/:handle — public, published-only gallery.
export function useUserProjects(
  handle: string | undefined,
  page = 1,
  pageSize = 10,
) {
  return useQuery({
    queryKey: projectKeys.byUser(handle ?? "", page, pageSize),
    queryFn: () => usersApi.getProjects(handle!, page, pageSize),
    enabled: !!handle, // don't fire until the router resolves :handle
    placeholderData: keepPreviousData,
  });
}

// Project detail (public, published only).
export function useProject(id: number | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? -1),
    queryFn: () => projectsApi.getById(id!),
    enabled: id != null,
  });
}

//mutations

// form-bound (one project at a time)
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.mineRoot() }),
  });
}

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

// list-bound (a toggle/button per card)
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

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.remove(id),
    onSuccess: (_void, id) => {
      qc.removeQueries({ queryKey: projectKeys.detail(id) }); // detail is now 404
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
