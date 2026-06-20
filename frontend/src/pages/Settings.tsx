import { useState, type ReactNode, type SubmitEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/lib/api";
import { updateProfileSchema, type UpdateProfileInput } from "@/types/project";
import { useUserProfile, useUpdateProfile } from "@/api/users";

// /settings - auth-only. Resolver loads the current profile to prefill; the
// inner view seeds its state once from `initial` (no effect copying server data
// into state).
export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const handle = user?.handle;

  const profile = useUserProfile(handle); // GET /api/users/{handle} (own, public data)
  const update = useUpdateProfile();

  const save = async (values: UpdateProfileInput) => {
    await update.mutateAsync(values);
    if (handle) navigate(`/u/${handle}`); // land on the public profile so the change is visible
  };

  // protected route guarantees a session, but guard defensively
  if (!handle) {
    return (
      <CenteredError message="You need to be signed in to edit your profile." />
    );
  }
  if (profile.isLoading)
    return <CenteredSpinner label="Loading your profile…" />;
  if (profile.isError || !profile.data) {
    return (
      <CenteredError message="Couldn't load your profile. Please try again." />
    );
  }

  const initial: FormState = {
    displayName: profile.data.displayName,
    bio: profile.data.bio ?? "", // contract sends null; the textarea wants a string
  };

  return (
    <SettingsForm
      key={handle}
      initial={initial}
      submitting={update.isPending}
      onSubmit={save}
    />
  );
}

type FormState = { displayName: string; bio: string };
type FieldErrors = Partial<Record<keyof UpdateProfileInput, string>>;

function SettingsForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial: FormState;
  submitting: boolean;
  onSubmit: (values: UpdateProfileInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    // empty bio -> null (the contract is bio?: string | null, not ""):
    const input: UpdateProfileInput = {
      displayName: form.displayName.trim(),
      bio: form.bio.trim() ? form.bio.trim() : null,
    };

    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      const fe = z.flattenError(parsed.error).fieldErrors;
      setErrors({ displayName: fe.displayName?.[0], bio: fe.bio?.[0] });
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
          <CardTitle>Profile settings</CardTitle>
          <CardDescription>
            This is what visitors see on your public profile at{" "}
            <span className="font-mono">/u/your-handle</span>.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-5">
            <Field
              id="displayName"
              label="Display name"
              error={errors.displayName}
            >
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder="e.g. Iraklis"
                disabled={submitting}
              />
            </Field>

            <Field id="bio" label="Bio (optional)" error={errors.bio}>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                rows={4}
                disabled={submitting}
                placeholder="A sentence or two about your ML focus."
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
              Save changes
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

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

function CenteredError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}
