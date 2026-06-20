// src/pages/ProjectDetail.tsx
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

  const { data, isLoading, isError, error } = useProject(id);

  const owned = Boolean((location.state as { owned?: boolean } | null)?.owned);

  const publish = usePublishProject();
  const del = useDeleteProject();

  if (id === undefined) return <NotFoundView />;
  if (isLoading) return <CenteredSpinner label="Loading project…" />;
  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return notFound ? <NotFoundView /> : <ErrorView />;
  }
  if (!data) return <NotFoundView />;

  const project: Project = data;

  const onUnpublish = () =>
    publish.mutate(
      { id: project.id, isPublished: false },
      { onSuccess: () => navigate("/dashboard", { replace: true }) },
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
            onClick={onUnpublish}
          >
            {publish.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Unpublish
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
