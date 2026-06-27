/**
 * Registration page. Collects email/password plus optional handle and display
 * name, calls `register` from {@link useAuth}, and redirects to /dashboard on
 * success (register also logs the user in — see AuthContext).
 *
 * Two error channels: field-level validation errors map to per-input messages
 * (see the PascalCase→camelCase remap in `onSubmit`), while anything else shows
 * as a single form-level message. Optional fields are trimmed and sent as
 * `undefined` when blank, so the backend applies its own defaults (e.g. handle
 * generation) rather than receiving empty strings.
 */
import {
  useState,
  type SubmitEvent,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
    handle: "",
    displayName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Curried change handler: set("email") returns the onChange for that field.
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        // Trim and omit-if-blank so the backend generates a handle / defaults a
        // display name rather than storing an empty string.
        handle: form.handle.trim() || undefined,
        displayName: form.displayName.trim() || undefined,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.problem?.errors) {
        // ASP.NET keys validation errors by PascalCase field name ("Password").
        // Lower-case the first letter to match our form field ids ("password").
        const fe: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(err.problem.errors)) {
          const field = key.charAt(0).toLowerCase() + key.slice(1);
          if (msgs?.length) fe[field] = msgs[0]; // first message per field is enough
        }
        setFieldErrors(fe);
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <Link
        to="/"
        className="mb-8 flex items-center gap-2 self-start font-semibold tracking-tight"
      >
        <Boxes className="h-5 w-5 text-primary" />
        <span>ML Portfolio Hub</span>
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        Create your portfolio
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your handle becomes your public URL at{" "}
        <span className="font-mono">/u/your-handle</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set("email")}
          error={fieldErrors.email}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={set("password")}
          error={fieldErrors.password}
        />
        <Field
          id="handle"
          label="Handle (optional)"
          placeholder="e.g. iraklis"
          value={form.handle}
          onChange={set("handle")}
          error={fieldErrors.handle}
        />
        <Field
          id="displayName"
          label="Display name (optional)"
          value={form.displayName}
          onChange={set("displayName")}
          error={fieldErrors.displayName}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Sign up"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  );
}

/** Labeled input with inline error display. Wires `aria-invalid` and the error
 *  paragraph from a single `error` prop; forwards all native input attributes. */
function Field({
  id,
  label,
  error,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input id={id} aria-invalid={!!error} {...props} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
