import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectGallery } from "@/components/projects/ProjectGallery";
import {
  useMyProjects,
  usePublishProject,
  useDeleteProject,
} from "@/api/projects";
import type { Project } from "@/types/project";

export default function Dashboard() {
  const [page, setPage] = useState(1);
  const projects = useMyProjects(page);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
        {/* "New project" button wires to the create form in a later step */}
      </header>

      <ProjectGallery
        projects={projects.data?.items ?? []}
        total={projects.data?.total ?? 0}
        page={page}
        pageSize={projects.data?.pageSize ?? 10}
        onPageChange={setPage}
        isLoading={projects.isLoading}
        isError={projects.isError}
        emptyMessage="You haven't created any projects yet."
        showStatus
        renderActions={(project) => <ProjectActions project={project} />}
      />
    </div>
  );
}

// co-located owner controls. Each card renders its OWN instance, so a publish
// or delete on one card never spins another card's buttons.
function ProjectActions({ project }: { project: Project }) {
  const publish = usePublishProject();
  const del = useDeleteProject();

  const togglePublish = () =>
    publish.mutate({ id: project.id, isPublished: !project.isPublished });

  const remove = () => {
    if (confirm(`Delete "${project.title}"? This can't be undone.`)) {
      del.mutate(project.id);
    }
  };

  const busy = publish.isPending || del.isPending;

  return (
    <>
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
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={busy}
        onClick={remove}
      >
        {del.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Delete
      </Button>
    </>
  );
}
