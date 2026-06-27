/**
 * Landing page (index route). Auth-aware hero, not a project feed: the contract
 * has no global "all published projects" endpoint (GET /api/projects is the
 * caller's own; the public list is per-handle), so there's nothing to feed here.
 * CTAs branch on session — dashboard + own profile when signed in, register/login
 * when not.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { PROJECT_DOMAINS } from "@/types/project";

export default function Home() {
  const { isAuthed, user } = useAuth();

  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-8 py-16 text-center sm:py-24">
      <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
        <Boxes className="h-4 w-4 text-primary" />
        Built for ML engineers and researchers
      </div>

      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Show your ML work,{" "}
          <span className="text-primary">not just your CV.</span>
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Build a portfolio of your machine learning projects, publish the ones
          you&apos;re proud of, and share one public profile link with
          recruiters and collaborators.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {isAuthed ? (
          <>
            <Button asChild size="lg">
              <Link to="/dashboard">
                Go to your dashboard
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            {user?.handle && (
              <Button asChild size="lg" variant="outline">
                <Link to={`/u/${user.handle}`}>View your public profile</Link>
              </Button>
            )}
          </>
        ) : (
          <>
            <Button asChild size="lg">
              <Link to="/register">
                Get started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Log in</Link>
            </Button>
          </>
        )}
      </div>

      {/* Domains the hub is built around — same source of truth the filter and
          the create form use (PROJECT_DOMAINS). */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
        {PROJECT_DOMAINS.map((d) => (
          <Badge key={d} variant="secondary">
            {d}
          </Badge>
        ))}
      </div>
    </section>
  );
}
