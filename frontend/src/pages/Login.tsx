/**
 * Login page. Collects email/password, calls `login` from {@link useAuth}, and
 * on success redirects to wherever the user was headed before being bounced here
 * (see the `from` round-trip below), defaulting to /dashboard.
 *
 * Local component state, not a form library — two fields don't justify the
 * overhead. The `ApiError.status` from the transport layer drives the error copy.
 */
import { useState, type SubmitEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect target after login. A route guard that bounces an unauthenticated
  // user here stashes their intended path in `location.state.from`; we send them
  // back there on success, falling back to /dashboard for a direct visit.
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from
      ?.pathname ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true }); // replace: don't leave /login in history
    } catch (err) {
      // 401 is the expected bad-credentials case → friendly copy; everything else
      // falls back to the server message, then a generic string.
      setError(
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong. Try again.",
      );
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
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Log in to manage your projects.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          to="/register"
          className="text-primary underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
