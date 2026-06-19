import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";

// same factory discipline as projectKeys
export const userKeys = {
  all: ["users"] as const,
  profile: (handle: string) => [...userKeys.all, "profile", handle] as const,
};

export function useUserProfile(handle: string | undefined) {
  return useQuery({
    queryKey: userKeys.profile(handle ?? ""),
    queryFn: () => usersApi.getProfile(handle!),
    enabled: !!handle, // wait for the route param, same as useUserProjects
  });
}
