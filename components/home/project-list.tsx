import Link from "next/link";
import { Folder } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/kit/data-table";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { projectDeleteDescription, type HomeProject } from "@/components/home/project-grid";
import { formatRelativeTime } from "@/src/server/dashboard-data";

function projectHref(project: HomeProject) {
  return `/projects/${project.id}`;
}

function deleteButton(project: HomeProject, className?: string) {
  return (
    <DeleteEntityButton
      endpoint={`/api/projects/${project.id}`}
      label={project.name}
      description={projectDeleteDescription(project)}
      className={className}
    />
  );
}

const COLUMNS: Array<DataColumn<HomeProject>> = [
  {
    key: "name",
    header: "Project",
    render: (project) => (
      <span className="flex min-w-0 items-start gap-2">
        <Folder className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 break-words font-medium text-foreground">{project.name}</span>
      </span>
    )
  },
  {
    key: "media",
    header: "Media",
    align: "end",
    mono: true,
    width: "6rem",
    render: (project) => project._count.mediaItems
  },
  {
    key: "updated",
    header: "Updated",
    align: "end",
    mono: true,
    width: "8rem",
    className: "text-muted-foreground",
    render: (project) => formatRelativeTime(project.updatedAt.toISOString())
  }
];

/**
 * Delete as a plain last column, not DataTable's `rowActions`: that cell carries an onClick
 * handler, which a Server Component can't send to the browser. The button stops its own clicks
 * and sits above the row's stretched link (z-[2]); rows have no click handler of their own.
 */
const ACTIONS_COLUMN: DataColumn<HomeProject> = {
  key: "actions",
  header: <span className="sr-only">Actions</span>,
  align: "end",
  width: "3.5rem",
  className: "py-1!",
  render: (project) => <span className="relative z-[2] inline-flex justify-end">{deleteButton(project)}</span>
};

/**
 * List view: a real table (Project | Media | Updated | delete), 48px rows with the whole row as
 * the link. "Updated" is what the Recent sort uses (renames and storage refreshes, not uploads).
 * Phones get two-line rows instead of a sideways-scrolling table.
 */
export function ProjectList({ projects, canDelete }: { projects: HomeProject[]; canDelete: boolean }) {
  return (
    <DataTable<HomeProject>
      caption="Projects"
      rows={projects}
      rowKey={(project) => project.id}
      rowHref={projectHref}
      stackBelow="sm"
      columns={canDelete ? [...COLUMNS, ACTIONS_COLUMN] : COLUMNS}
      renderMobileRow={(project) => (
        <div className="relative flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--ink-3)]">
          <div className="min-w-0 flex-1">
            <Link
              href={projectHref(project) as never}
              className="block truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
            >
              {project.name}
            </Link>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              <span className="font-mono-broadcast tabular-nums">{project._count.mediaItems}</span> media · Updated{" "}
              {formatRelativeTime(project.updatedAt.toISOString())}
            </p>
          </div>
          {canDelete ? deleteButton(project, "z-10 -mr-2") : null}
        </div>
      )}
    />
  );
}
