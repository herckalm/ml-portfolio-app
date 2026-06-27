/**
 * Owner dashboard. Lists the signed-in user's projects (all statuses) via
 * {@link useMyProjects} and renders them through the shared {@link ProjectGallery}
 * in owner mode (`owned` + `showStatus`), injecting per-card publish/edit/delete
 * actions. Also shows a link to the user's own public profile.
 *
 * This is one of the two call sites of the project mutation hooks (the other is
 * ProjectDetail); see {@link ProjectActions} for how invalidation flows back into
 * the list after a publish or delete.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProjectGallery } from "@/components/projects/ProjectGallery";
import {
  useMyProjects,
  usePublishProject,
  useDeleteProject,
} from "@/api/projects";
import { useUserProfile } from "@/api/users";
import { useAuth } from "@/auth/AuthContext";
import type { Project } from "@/types/project";

export default function Dashboard() {
  const [page, setPage] = useState(1);
  const projects = useMyProjects(page);

  const { user } = useAuth();
  const profile = useUserProfile(user?.handle); // enabled-gated until handle resolves

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your projects
          </h1>
          {profile.data && (
            <p className="text-sm text-muted-foreground">
              Signed in as {profile.data.displayName} ·{" "}
              <Link
                to={`/u/${profile.data.handle}`}
                className="text-primary underline underline-offset-4"
              >
                view public profile
              </Link>
            </p>
          )}
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New project
          </Link>
        </Button>
      </header>

      <ProjectGallery
        projects={projects.data?.items ?? []}
        total={projects.data?.total ?? 0}
        page={page}
        pageSize={projects.data?.pageSize ?? 10}
        onPageChange={setPage}
        isLoading={projects.isLoading}
        isError={projects.isError}
        emptyMessage="You haven't created any projects yet."
        showStatus
        owned
        renderActions={(project) => <ProjectActions project={project} />}
      />
    </div>
  );
}

/**
 * Per-card owner actions: edit (carries the project in router state so the form
 * skips a refetch), publish toggle, and a confirm-gated delete. The mutations'
 * own `onSuccess` handlers invalidate the list cache, so this component holds no
 * success logic — it only reflects pending state via `busy`.
 */
function ProjectActions({ project }: { project: Project }) {
  const publish = usePublishProject();
  const del = useDeleteProject();

  const togglePublish = () =>
    publish.mutate({ id: project.id, isPublished: !project.isPublished });

  const busy = publish.isPending || del.isPending;

  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link to={`/projects/${project.id}/edit`} state={{ project }}>
          Edit
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={togglePublish}
      >
        {publish.isPending && (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        )}
        {project.isPublished ? "Unpublish" : "Publish"}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy}
          >
            {del.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{project.title}</strong> will
              be permanently removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate(project.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
