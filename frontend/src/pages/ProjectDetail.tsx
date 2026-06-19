import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import type { Project } from "@/types/project";
import {
  useProject,
  usePublishProject,
  useDeleteProject,
} from "@/api/projects";

// /projects/:id - the PUBLIC detail view. useProject wraps getById, which the
// backend serves published-only (404 on a draft), so anything that renders here
// is by definition a live project a logged-out visitor is allowed to see.
//
// Ownership note: we do NOT detect it from the data. The DTO has a numeric
// ownerId; the only identity we hold client-side is the auth handle - no shared
// key. And this route is public, so it must never call an auth-only endpoint
// (getMine) to find out who owns the project - that would 401 and bounce an
// anonymous viewer to /login. Owner intent is therefore passed via router state
// from owner contexts; without it, this is a clean read-only page.
export default function ProjectDetail() {
  const { id: idParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const parsed = idParam ? Number(idParam) : undefined;
  const id = parsed != null && !Number.isNaN(parsed) ? parsed : undefined;

  const { data, isLoading, isError, error } = useProject(id);

  const owned = Boolean((location.state as { owned?: boolean } | null)?.owned);

  // Idle until the owner clicks - mutations never fire on mount, so declaring
  // them is safe even for anonymous viewers (the owner band that uses them only
  // renders when `owned` is true).
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
      // once unpublished it's a draft - this public page would 404 on refresh,
      // so send the owner back to where drafts live.
      { onSuccess: () => navigate("/dashboard", { replace: true }) },
    );

  const onDelete = () => {
    if (confirm(`Delete "${project.title}"? This can't be undone.`)) {
      del.mutate(project.id, {
        onSuccess: () => navigate("/dashboard", { replace: true }),
      });
    }
  };

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

      {/* whitespace-pre-line preserves the author's line breaks without pulling
          in a markdown renderer. */}
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
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={onDelete}
          >
            {del.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Delete
          </Button>
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
