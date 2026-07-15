/**
 * Project detail page at `/projects/:id`. Renders a single project and, when the viewer owns it, an action band (edit / publish toggle / delete).
 *
 * @remarks
 * Two subtleties drive this component:
 *
 * 1. **Draft visibility via router state.** The public GET 404s on unpublished
 projects, so a draft can't be loaded by id alone. When navigation comes from
 an owner surface (ProjectCard / Dashboard with `owned`), the full project
 rides in `location.state`. We prefer the freshly-fetched `data` but fall
 back to that passed project (`data ?? passedProject`) — which is what lets an
 owner open their own draft here. `owned` also gates the action band.
 *
 * 2. **404 vs real error.** A 404 is the *expected* outcome for a draft/missing
 project and shows the soft "not found" view; any other error (network, 5xx)
 shows the error view. The `error.status === 404` check is what separates them.
 *
 * 3. **Live demo.** When the project carries a runnable predictor key
 (`project.modelId`), a "Try it live" section renders below the description,
 reusing the shared predict hook + result presenter. Projects without a
 modelId (the common case) show no demo — the field is the gate.
 * The demo UI is routed by model id prefix: distilbert-* → text input,
 * vit-* → image upload.
 */
import { useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, Sparkles } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import type { Project } from "@/types/project";
import {
  useProject,
  usePublishProject,
  useDeleteProject,
} from "@/api/projects";
import { usePredict, usePredictImage } from "@/api/predict";
import { PredictResult } from "@/components/predict/PredictResult";

export default function ProjectDetail() {
  const { id: idParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const parsed = idParam ? Number(idParam) : undefined;
  const id = parsed != null && !Number.isNaN(parsed) ? parsed : undefined;

  const state = location.state as {
    owned?: boolean;
    project?: Project;
    backTo?: string;
  } | null;
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
        <Link to={state?.backTo ?? "/"}>
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

      {/* Live inference demo — only for projects backed by a runnable predictor. */}
      {project.modelId && <ModelDemo modelId={project.modelId} />}

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

/**
 * Routes to the correct demo UI based on the model id prefix.
 * distilbert-* → text input; vit-* → image upload.
 */
function ModelDemo({ modelId }: { modelId: string }) {
  if (modelId.startsWith("vit-")) {
    return <ImageModelDemo modelId={modelId} />;
  }
  return <TextModelDemo modelId={modelId} />;
}

/**
 * Text inference demo — NLP models.
 */
function TextModelDemo({ modelId }: { modelId: string }) {
  const [text, setText] = useState("");
  const predict = usePredict(modelId);

  const canSubmit = text.trim().length > 0 && !predict.isPending;

  const run = () => {
    if (!canSubmit) return;
    predict.mutate({ text: text.trim() });
  };

  const errorMessage =
    predict.error instanceof ApiError
      ? predict.error.message
      : predict.isError
        ? "Something went wrong running the model. Please try again."
        : null;

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" />
          Try it live
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter some text and run it through the model to see a prediction.
        </p>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        disabled={predict.isPending}
        placeholder="e.g. A debt collector keeps calling me about an account I already paid off months ago…"
      />

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={!canSubmit}>
          {predict.isPending && (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          )}
          Run prediction
        </Button>
        {predict.isPending && (
          <span className="text-sm text-muted-foreground">Running…</span>
        )}
      </div>

      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}

      {predict.data && <PredictResult envelope={predict.data} />}
    </section>
  );
}

/**
 * Image inference demo — CV models.
 */
function ImageModelDemo({ modelId }: { modelId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const predict = usePredictImage(modelId);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    predict.reset();
  };

  const canSubmit = file !== null && !predict.isPending;

  const run = () => {
    if (!canSubmit) return;
    predict.mutate(file);
  };

  const errorMessage =
    predict.error instanceof ApiError
      ? predict.error.message
      : predict.isError
        ? "Something went wrong running the model. Please try again."
        : null;

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" />
          Try it live
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload an image and run it through the model to see a prediction.
        </p>
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFile}
        disabled={predict.isPending}
        className="text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
      />

      {preview && (
        <img
          src={preview}
          alt="Preview"
          className="h-40 w-40 rounded-md object-cover border border-border"
        />
      )}

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={!canSubmit}>
          {predict.isPending && (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          )}
          Run prediction
        </Button>
        {predict.isPending && (
          <span className="text-sm text-muted-foreground">Running…</span>
        )}
      </div>

      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}

      {predict.data && <PredictResult envelope={predict.data} />}
    </section>
  );
}

/** Soft not-found: the expected view for a missing or unpublished (draft) project. */
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

/** Hard error: a genuine fetch failure (network/5xx), as opposed to a 404. */
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
