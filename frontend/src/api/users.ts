import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import type { UpdateProfileInput } from "@/types/project";

// same factory discipline as projectKeys
export const userKeys = {
  all: ["users"] as const,
  profile: (handle: string) => [...userKeys.all, "profile", handle] as const,
};

// GET /api/users/{handle} — public profile. Enabled-gated so it waits for a
// handle (router param, or the logged-in user's handle) before firing.
export function useUserProfile(handle: string | undefined) {
  return useQuery({
    queryKey: userKeys.profile(handle ?? ""),
    queryFn: () => usersApi.getProfile(handle!),
    enabled: !!handle,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateMe(input),
    onSuccess: (updated) => {
      // PUT returns the updated UserProfileDto, so seed the cache and refetch
      // anything keyed under this user (their public profile at /u/:handle).
      qc.setQueryData(userKeys.profile(updated.handle), updated);
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
