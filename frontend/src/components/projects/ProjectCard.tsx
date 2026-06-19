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

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

type ProjectCardProps = {
  project: Project;
  showStatus?: boolean;
  actions?: ReactNode;
};

export function ProjectCard({
  project,
  showStatus = false,
  actions,
}: ProjectCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="leading-snug">
            <Link
              to={`/projects/${project.id}`}
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
        <span className="ml-auto text-muted-foreground">
          {dateFmt.format(project.createdAt)}
        </span>
      </CardContent>

      {actions && <CardFooter className="gap-2">{actions}</CardFooter>}
    </Card>
  );
}
