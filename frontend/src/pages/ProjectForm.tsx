import { z } from "zod";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createProjectSchema,
  PROJECT_DOMAINS,
  type CreateProjectInput,
  type Project,
} from "@/types/project";
import { useCreateProject, useUpdateProject, useProject } from "@/api/projects";

// create and edit are the SAME form; the route decides the mode:
//   /projects/new        -> create  (no :id)
//   /projects/:id/edit   -> edit    (:id present)
//
// Split into two pieces on purpose:
//   ProjectForm     - the RESOLVER: figures out the mode, gets the prefill, owns
//                     the mutation + loading/error gates. Renders nothing editable.
//   ProjectFormView - the FORM: pure controlled inputs whose state is seeded ONCE
//                     from `initial` via a lazy useState. It only mounts after the
//                     resolver has a definitive `initial`, so there's no effect
//                     copying server data into state (that's the cascading-render
//                     pattern React 19 warns about - derive/seed-once instead).

const EMPTY: CreateProjectInput = {
  title: "",
  description: "",
  domain: "",
  modelType: "",
};

export default function ProjectForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: idParam } = useParams();

  const id = idParam ? Number(idParam) : undefined;
  const isEdit = id != null && !Number.isNaN(id);

  // EDIT PREFILL - two sources, in priority order:
  //   1. router state: the Dashboard "Edit" link passes the full project (it
  //      already has it from useMyProjects, which returns ALL statuses incl.
  //      drafts). No network round-trip, and it works for drafts.
  //   2. cold-load fallback (refresh / deep link -> state is gone): re-fetch via
  //      useProject. CAVEAT: that's the PUBLIC getById, which 404s on a draft -
  //      so a refreshed edit of an unpublished project lands in the error branch
  //      below. The backend has no "GET my project by id (any status)" endpoint,
  //      so this is the contract's limit, not a bug to fix here.
  const passed = (location.state as { project?: Project } | null)?.project;
  const fallback = useProject(isEdit && !passed ? id : undefined);

  // Both hooks run every render (rules of hooks). In create mode useUpdateProject
  // gets a throwaway id (-1) that's never submitted; in edit mode useCreateProject
  // is simply never triggered. We pick the active one after.
  const create = useCreateProject();
  const update = useUpdateProject(isEdit ? id! : -1);
  const mutation = isEdit ? update : create;

  const save = async (values: CreateProjectInput) => {
    const saved = await mutation.mutateAsync(values);
    // A freshly created project is a DRAFT; its public detail page (/projects/:id)
    // 404s until it's published. So we always return to the dashboard, where drafts
    // are visible and the publish toggle lives - never to the detail page.
    navigate("/dashboard", { replace: true, state: { justSaved: saved.id } });
  };

  // cold-load edit: still fetching to prefill
  if (isEdit && !passed && fallback.isLoading) {
    return <CenteredSpinner label="Loading project…" />;
  }
  // cold-load edit failed (most likely a draft - see the prefill comment)
  if (isEdit && !passed && fallback.isError) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t open this project for editing. Start the edit from your
          dashboard so its details travel with you - drafts aren&apos;t
          reachable from the public endpoint.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  // By here `initial` is settled: EMPTY for create, the passed/fetched project
  // for edit. The view seeds its state from it once and owns it thereafter.
  const source = passed ?? fallback.data;
  const initial = source ? toInput(source) : EMPTY;

  return (
    <ProjectFormView
      // remount (fresh state) if we ever switch between different projects without
      // unmounting - e.g. /projects/1/edit -> /projects/2/edit via a stateful link.
      key={isEdit ? id : "new"}
      initial={initial}
      isEdit={isEdit}
      submitting={mutation.isPending}
      onSubmit={save}
    />
  );
}

type FieldErrors = Partial<Record<keyof CreateProjectInput, string>>;

function ProjectFormView({
  initial,
  isEdit,
  submitting,
  onSubmit,
}: {
  initial: CreateProjectInput;
  isEdit: boolean;
  submitting: boolean;
  onSubmit: (values: CreateProjectInput) => Promise<void>;
}) {
  // seeded ONCE from `initial` - no effect, no cascading render.
  const [form, setForm] = useState<CreateProjectInput>(() => initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (key: keyof CreateProjectInput, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    // Reuse the response schema as an INPUT validator. The same Zod object that
    // guards the network boundary now guards the form - one contract, not two
    // hand-kept-in-sync rule sets. (Same "validate where data enters the system"
    // discipline you'd apply to model I/O.)
    const parsed = createProjectSchema.safeParse(form);
    if (!parsed.success) {
      const fe = z.flattenError(parsed.error).fieldErrors;
      setErrors({
        title: fe.title?.[0],
        description: fe.description?.[0],
        domain: fe.domain?.[0],
        modelType: fe.modelType?.[0],
      });
      return;
    }

    try {
      await onSubmit(parsed.data); // navigates on success -> this view unmounts
    } catch (err) {
      setServerError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save. Please try again.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Edit project" : "New project"}</CardTitle>
          <CardDescription>
            {isEdit
              ? "Update the details. Publishing stays a separate action on your dashboard."
              : "Create a draft. You can publish it from your dashboard when it's ready."}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-5">
            <Field id="title" label="Title" error={errors.title}>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Sentiment classifier for product reviews"
                disabled={submitting}
              />
            </Field>

            <Field
              id="description"
              label="Description"
              error={errors.description}
            >
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                disabled={submitting}
                placeholder="What it does, the approach, the headline results…"
              />
            </Field>

            <Field id="domain" label="Domain" error={errors.domain}>
              {/* Single-select chips - reuses CategoryFilter's visual language
                  (default = violet/selected, outline = unselected) and constrains
                  input to the exact PROJECT_DOMAINS strings the backend stores. */}
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Project domain"
              >
                {PROJECT_DOMAINS.map((d) => {
                  const selected = form.domain === d;
                  return (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      disabled={submitting}
                      onClick={() => set("domain", d)}
                    >
                      {d}
                    </Button>
                  );
                })}
              </div>
            </Field>

            <Field id="modelType" label="Model type" error={errors.modelType}>
              <Input
                id="modelType"
                value={form.modelType}
                onChange={(e) => set("modelType", e.target.value)}
                placeholder="e.g. Transformer, Random Forest, CNN"
                disabled={submitting}
              />
            </Field>

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => window.history.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {isEdit ? "Save changes" : "Create draft"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// Project (full DTO) -> the editable subset the form + payload schemas care about.
function toInput(p: Project): CreateProjectInput {
  return {
    title: p.title,
    description: p.description,
    domain: p.domain,
    modelType: p.modelType,
  };
}

// labeled-field wrapper - mirrors the Field helper in Login/Register so every
// form in the app reads the same (native <label> + control + error line).
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
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
