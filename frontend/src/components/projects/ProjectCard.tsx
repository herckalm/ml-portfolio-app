/**
 * Presentational card for a single project. Pure display — no data fetching, no
 * mutations; any action buttons are injected by the parent via `actions`, so the
 * card stays reusable across owner and public contexts.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types/project";

// Module-scoped so the formatter is created once, not per render.
const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

type ProjectCardProps = {
  project: Project;
  /** Show the Published/Draft badge — only meaningful in the owner's view. */
  showStatus?: boolean;
  /**
   * Marks this as the owner's own card. When true, the detail link carries
   * `{ owned, project }` in router state — which lets ProjectDetail render the
   * owner band *and* display a draft directly, bypassing the public GET that
   * would 404 on an unpublished project. See ProjectDetail for the consuming side.
   */
  owned?: boolean;
  /**
   * Optional back-navigation target passed through router state to ProjectDetail.
   * When set, the detail page's Back button returns here instead of "/".
   * Typically the public profile URL (e.g. "/u/iraklis").
   */
  backTo?: string;
  /** Optional footer actions (publish toggle, edit, delete), injected by parent. */
  actions?: ReactNode;
};

export function ProjectCard({
  project,
  showStatus = false,
  owned = false,
  backTo,
  actions,
}: ProjectCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="leading-snug">
            <Link
              to={`/projects/${project.id}`}
              state={
                owned
                  ? { owned: true, project, backTo }
                  : backTo
                    ? { backTo }
                    : undefined
              }
              className="underline-offset-4 hover:text-primary hover:underline"
            >
              {project.title}
            </Link>
          </CardTitle>
          {showStatus && (
            <Badge variant={project.isPublished ? "default" : "secondary"}>
              {project.isPublished ? "Published" : "Draft"}
            </Badge>
          )}
        </div>
        <CardDescription className="line-clamp-2">
          {project.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="mt-auto flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{project.domain}</Badge>
        <span className="text-muted-foreground">{project.modelType}</span>
        {project.gitHubUrl && (
          <a
            href={project.gitHubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            aria-label={`View source code for ${project.title}`}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="currentColor"
              aria-hidden
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Code
          </a>
        )}
        <span className="ml-auto text-muted-foreground">
          {dateFmt.format(project.createdAt)}
        </span>
      </CardContent>

      {actions && <CardFooter className="gap-2">{actions}</CardFooter>}
    </Card>
  );
}
