/**
 * TanStack Query hooks for users/profiles. Same shape as the projects layer —
 * thin wrappers over `usersApi` with cache-key identity and invalidation. The
 * key-factory discipline and invalidation rationale are documented once in
 * `@/api/projects`; this file follows the same conventions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import type { UpdateProfileInput } from "@/types/project";

/** Query-key factory — same prefix discipline as `projectKeys`. */
export const userKeys = {
  all: ["users"] as const,
  profile: (handle: string) => [...userKeys.all, "profile", handle] as const,
};

/** Public profile fetch. `enabled`-gated so it waits for a handle — either a
 *  router param or the logged-in user's own — before firing. */
export function useUserProfile(handle: string | undefined) {
  return useQuery({
    queryKey: userKeys.profile(handle ?? ""),
    queryFn: () => usersApi.getProfile(handle!),
    enabled: !!handle,
  });
}

/** Profile update. PUT returns the updated DTO, so seed the detail cache with it
 *  and invalidate `all` to refetch the public profile at `/u/:handle`. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      qc.setQueryData(userKeys.profile(updated.handle), updated);
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * Account deletion (server cascades to the user's projects). Intentionally has
 * no `onSuccess` cache work: the caller (Settings) runs `logout()` on success,
 * which calls `queryClient.clear()` and wipes the entire cache. Doing cache
 * surgery here would be redundant and could race that teardown.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => usersApi.deleteMe(),
  });
}
