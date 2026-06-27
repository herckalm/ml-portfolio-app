/**
 * Public profile at `/u/:handle`. The read-side counterpart to the Dashboard:
 * same {@link ProjectGallery}, but fed by the public published-only endpoints
 * ({@link useUserProfile} + {@link useUserProjects}) instead of the owner's list.
 *
 * Detects the visitor viewing their *own* profile (`user.handle === handle`) and
 * passes `owned` through to the gallery so their cards carry owner context — the
 * same router-state mechanism the dashboard uses (see ProjectCard / ProjectDetail).
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useUserProfile } from "@/api/users";
import { useUserProjects } from "@/api/projects";
import { ProjectGallery } from "@/components/projects/ProjectGallery";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";

const memberFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
});

export default function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();
  const [page, setPage] = useState(1);

  const profile = useUserProfile(handle);
  const projects = useUserProjects(handle, page);

  const { user } = useAuth();
  const owned = !!user && !!handle && user.handle === handle;

  // The profile call 404ing is the authoritative "user doesn't exist" signal
  // (an unknown handle has no profile), so the whole page gates on it.
  const notFound =
    profile.error instanceof ApiError && profile.error.status === 404;

  if (notFound) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">User not found</h1>
        <p className="mt-2 text-muted-foreground">
          No portfolio exists at <span className="font-mono">/u/{handle}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        {profile.isLoading ? (
          <>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </>
        ) : profile.data ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.data.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              @{profile.data.handle} · Member since{" "}
              {memberFmt.format(profile.data.memberSince)}
            </p>
            {profile.data.bio && (
              <p className="max-w-2xl text-sm">{profile.data.bio}</p>
            )}
          </>
        ) : null}
      </header>

      <ProjectGallery
        projects={projects.data?.items ?? []}
        total={projects.data?.total ?? 0}
        page={page}
        pageSize={projects.data?.pageSize ?? 10}
        onPageChange={setPage}
        isLoading={projects.isLoading}
        isError={projects.isError}
        owned={owned}
        emptyMessage={`${profile.data?.displayName ?? "This user"} hasn't published any projects yet.`}
      />
    </div>
  );
}
