import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import type { Project } from "@/types/project";
import {
  useProject,
  usePublishProject,
  useDeleteProject,
} from "@/api/projects";

export default function ProjectDetail() {
  const { id: idParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const parsed = idParam ? Number(idParam) : undefined;
  const id = parsed != null && !Number.isNaN(parsed) ? parsed : undefined;

  const state = location.state as { owned?: boolean; project?: Project } | null;
  const owned = Boolean(state?.owned);
  const passedProject = state?.project;

  const { data, isLoading, isError, error } = useProject(id);
  const publish = usePublishProject();
  const del = useDeleteProject();

  const project = data ?? passedProject;

  if (id === undefined) return <NotFoundView />;
  if (isLoading && !project)
    return <CenteredSpinner label="Loading project…" />;
  if (!project) {
    const realError =
      isError && !(error instanceof ApiError && error.status === 404);
    return realError ? <ErrorView /> : <NotFoundView />;
  }

  const togglePublish = () =>
    publish.mutate(
      { id: project.id, isPublished: !project.isPublished },
      {
        onSuccess: () => {
          if (project.isPublished) navigate("/dashboard", { replace: true });
        },
      },
    );

  const busy = publish.isPending || del.isPending;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Link>
      </Button>

      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <Badge variant="secondary">{project.domain}</Badge>
          <span>{project.modelType}</span>
          <span aria-hidden>·</span>
          <time dateTime={project.createdAt.toISOString()}>
            {project.createdAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          {project.gitHubUrl && (
            <>
              <span aria-hidden>·</span>

              <a
                href={project.gitHubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                View code
              </a>
            </>
          )}
        </div>
      </header>

      <p className="whitespace-pre-line leading-relaxed text-foreground/90">
        {project.description}
      </p>

      {owned && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-6">
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${project.id}/edit`} state={{ project }}>
              <Pencil className="mr-1.5 h-4 w-4" />
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
                  <strong className="text-foreground">{project.title}</strong>{" "}
                  will be permanently removed. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    del.mutate(project.id, {
                      onSuccess: () =>
                        navigate("/dashboard", { replace: true }),
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </article>
  );
}

function NotFoundView() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Project not found
      </h1>
      <p className="text-sm text-muted-foreground">
        This project doesn&apos;t exist or hasn&apos;t been published yet.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}

function ErrorView() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Couldn&apos;t load project
      </h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong fetching this project. Please try again.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
