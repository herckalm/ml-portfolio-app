import { useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import {
  CategoryFilter,
  type DomainFilter,
} from "@/components/projects/CategoryFilter";
import type { Project } from "@/types/project";

type ProjectGalleryProps = {
  projects: Project[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  showStatus?: boolean;
  renderActions?: (project: Project) => ReactNode;
};

export function ProjectGallery({
  projects,
  total,
  page,
  pageSize,
  onPageChange,
  isLoading,
  isError,
  errorMessage = "Couldn't load projects.",
  emptyMessage = "No projects yet.",
  showStatus = false,
  renderActions,
}: ProjectGalleryProps) {
  const [domain, setDomain] = useState<DomainFilter>("all");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visible =
    domain === "all" ? projects : projects.filter((p) => p.domain === domain);

  return (
    <div className="space-y-6">
      <CategoryFilter value={domain} onChange={setDomain} />

      {isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          {errorMessage}
        </p>
      ) : isLoading ? (
        <GridShell>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </GridShell>
      ) : projects.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : visible.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          No {domain} projects on this page.{" "}
          <button
            type="button"
            onClick={() => setDomain("all")}
            className="text-primary underline underline-offset-4"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <>
          <GridShell>
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                showStatus={showStatus}
                actions={renderActions?.(project)}
              />
            ))}
          </GridShell>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GridShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}
