import type { ReactNode } from "react";
import { FolderOpen, Sparkles } from "lucide-react";
import { CreateProjectButton } from "@/components/create-project-tile";
import { EmptyState } from "@/components/kit/empty-state";
import { MainWithRail } from "@/components/kit/layout";
import { StatusTag } from "@/components/kit/status-tag";
import { SectionHeader } from "@/components/kit/section";
import { PageHeader } from "@/components/page-header";
import { ActivityPanel } from "@/components/home/activity-panel";
import { MyPackageStrip } from "@/components/home/my-package-strip";
import { PackagesToolbar } from "@/components/home/packages-toolbar";
import type { WorkspaceOption } from "@/components/home/workspace-select";
import { ProjectGrid, type HomeProject } from "@/components/home/project-grid";
import { ProjectList } from "@/components/home/project-list";
import type { SortValue, ViewValue } from "@/components/home/home-format";
import type { DashboardActivityEntry, DashboardUpNext } from "@/src/server/dashboard-data";

function EmptyBox({ children }: { children: ReactNode }) {
  return <div className="flex min-h-48 items-center justify-center rounded-md border border-border bg-card">{children}</div>;
}

/**
 * Producer Packages (and the App Review account): header with the one primary New project, the
 * cycle as a tag and the project count in its line, the producer's own package strip when
 * they're on a roster, one toolbar row across the whole column (the workspace picker when there
 * are 2+ workspaces; sort and view when there are projects), then the projects with Your
 * activity in a rail from xl. The toolbar sits above both, so the grid and the rail start on the
 * same line and the toolbar's edges are the page's. The workspace comes from ?workspaceId= and
 * the header title names it.
 */
export function ProducerPackages({
  eyebrow,
  title,
  description,
  selectedWorkspace,
  workspaces,
  projects,
  sort,
  view,
  canCreate,
  createHint,
  canDelete,
  upNext,
  peopleLine,
  activity,
  embedded = false
}: {
  eyebrow: string;
  title: string;
  description: string;
  selectedWorkspace: { id: string; name: string } | null;
  /** Every workspace the viewer can open (the picker shows with 2+). */
  workspaces: WorkspaceOption[];
  projects: HomeProject[];
  sort: SortValue;
  view: ViewValue;
  canCreate: boolean;
  /** Muted line under "No projects in this workspace yet" for people who can't add one. */
  createHint: string | null;
  canDelete: boolean;
  upNext: DashboardUpNext | null;
  peopleLine: string | null;
  activity: DashboardActivityEntry[];
  /** Inside the executive home: a "Projects" section heading instead of a second page header. */
  embedded?: boolean;
}) {
  const createButton = selectedWorkspace ? (
    <CreateProjectButton workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name} />
  ) : null;

  let content: ReactNode;
  if (!selectedWorkspace) {
    content = (
      <EmptyBox>
        <EmptyState icon={FolderOpen} title="No workspaces yet" description="You do not have any workspaces yet." />
      </EmptyBox>
    );
  } else if (projects.length === 0) {
    content = (
      <EmptyBox>
        <EmptyState
          icon={Sparkles}
          title="No projects in this workspace yet"
          description={canCreate ? undefined : (createHint ?? undefined)}
          action={canCreate ? createButton : undefined}
        />
      </EmptyBox>
    );
  } else if (view === "list") {
    content = <ProjectList projects={projects} canDelete={canDelete} />;
  } else {
    content = <ProjectGrid projects={projects} canDelete={canDelete} />;
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {embedded ? (
        <SectionHeader
          id="home-projects-heading"
          title="Projects"
          description={selectedWorkspace?.name}
          actions={canCreate && projects.length > 0 ? createButton : null}
        />
      ) : (
        <PageHeader
          eyebrow={eyebrow}
          status={upNext ? <StatusTag tone="neutral">{`Cycle ${upNext.cycleNumber}`}</StatusTag> : null}
          title={title}
          description={description}
          actions={canCreate && projects.length > 0 ? createButton : null}
        />
      )}

      {upNext ? <MyPackageStrip upNext={upNext} peopleLine={peopleLine ?? ""} /> : null}

      {selectedWorkspace && (projects.length > 0 || workspaces.length >= 2) ? (
        <PackagesToolbar
          workspaceId={selectedWorkspace.id}
          workspaces={workspaces}
          sort={sort}
          view={view}
          showViewControls={projects.length > 0}
        />
      ) : null}

      <MainWithRail railWidth="20rem" rail={<ActivityPanel activity={activity} padding="md" />}>
        <section aria-labelledby="home-projects-title" className="min-w-0">
          <h2 id="home-projects-title" className="sr-only">
            Projects
          </h2>
          {content}
        </section>
      </MainWithRail>
    </div>
  );
}
