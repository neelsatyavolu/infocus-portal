import { LayoutGrid, List } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { WorkspaceSelect, type WorkspaceOption } from "@/components/home/workspace-select";
import { SORT_OPTIONS, dashboardHref, type SortValue, type ViewValue } from "@/components/home/home-format";

/**
 * The one row above the projects and the rail, across the whole content column (kit Toolbar,
 * `touch` size: 40px on phones, 36px from md, so every control matches). Sort and view are
 * links, so the URL (workspaceId, sort, view) stays the source of truth; they only show when the
 * workspace has projects. With 2+ workspaces the workspace picker leads the row and Sort moves
 * to the end beside Grid / List; on phones the picker gets its own full-width line and Sort
 * fills the line below. With one workspace: Sort at the start, Grid / List at the end, one row.
 */
export function PackagesToolbar({
  workspaceId,
  workspaces,
  sort,
  view,
  showViewControls
}: {
  workspaceId: string;
  workspaces: WorkspaceOption[];
  sort: SortValue;
  view: ViewValue;
  showViewControls: boolean;
}) {
  const hasPicker = workspaces.length >= 2;

  const sortControl = showViewControls ? (
    <SegmentedControl
      ariaLabel="Sort projects"
      size="touch"
      value={sort}
      className={hasPicker ? "max-sm:flex-1 max-sm:*:flex-1" : undefined}
      options={SORT_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        href: dashboardHref({ workspaceId, sort: option.value, view })
      }))}
    />
  ) : null;

  const viewControl = showViewControls ? (
    <SegmentedControl
      ariaLabel="Layout"
      size="touch"
      value={view}
      iconOnly
      options={[
        { value: "grid", icon: <LayoutGrid />, ariaLabel: "Grid view", href: dashboardHref({ workspaceId, sort, view: "grid" }) },
        { value: "list", icon: <List />, ariaLabel: "List view", href: dashboardHref({ workspaceId, sort, view: "list" }) }
      ]}
    />
  ) : null;

  if (hasPicker) {
    return (
      <Toolbar
        aria-label="Project view"
        size="touch"
        className="max-sm:*:w-full"
        start={<WorkspaceSelect workspaces={workspaces} value={workspaceId} sort={sort} view={view} />}
        end={
          showViewControls ? (
            <>
              {sortControl}
              {viewControl}
            </>
          ) : undefined
        }
      />
    );
  }

  return <Toolbar aria-label="Project view" size="touch" start={sortControl} end={viewControl} />;
}
