/**
 * Route-level 404 — the catch-all for `App.tsx`'s `path="*"`. Renders inside
 * RootLayout, so the navbar stays and the visitor isn't stranded. Distinct from
 * ProjectDetail's "not found" view, which is the published-or-missing case for a
 * specific project id; this one is for an unmatched URL.
 */
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const location = useLocation();

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight text-primary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {location.pathname}
        </code>
        . It may have moved, or never existed.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back home</Link>
      </Button>
    </section>
  );
}
