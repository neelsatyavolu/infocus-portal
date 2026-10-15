"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ListChecks } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import type { MenuEntry } from "@/components/kit/menu";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { MembersCell, NotesCell, ProducerCell, StatusCell, TopicCell, type RosterCellContext } from "./roster-cells";
import type { ProgressRow, RowStatus } from "./roster-model";
import { RowMenu } from "./roster-row-menu";

export type RosterEntry = {
  /** Stable React key (survives a new row getting its id). */
  key: string;
  /** Position in the full roster: every edit, move and delete uses this, never the filtered position. */
  index: number;
  row: ProgressRow;
  status: RowStatus;
};

/*
 * One grid for the header and every row, switched by the list's own width (container queries):
 * - cards below 42rem: number, topic and ⋮, then label/value lines (Stage, Members, Producer,
 *   notes) whose labels start on the number's edge;
 * - cards from 42rem: Members and Producer share a line, and so do Interviews and Notes (the
 *   notes cell is a subgrid of the row, so its two halves sit on the same columns);
 * - a table from 56rem: Topic · Members · Producer · Interviews & notes · Stage · ⋮ — no sideways scroll.
 * The minimums plus gaps and padding fit inside 56rem.
 */
// Cards: 4px between lines (the lines themselves are 32–40px tall).
const GRID_EDITOR = cn(
  "grid gap-x-3 gap-y-1",
  "[grid-template-columns:minmax(0,1fr)_auto] [grid-template-areas:'topic_menu'_'status_status'_'members_members'_'producer_producer'_'notes_notes']",
  "@2xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_auto] @2xl:[grid-template-areas:'topic_topic_menu'_'status_status_status'_'members_producer_producer'_'notes_notes_notes']",
  "@4xl:gap-y-0 @4xl:[grid-template-columns:minmax(10.5rem,1.4fr)_minmax(9.5rem,1.2fr)_minmax(8.5rem,1fr)_minmax(10rem,1.2fr)_minmax(9rem,1fr)_2rem] @4xl:[grid-template-areas:'topic_members_producer_notes_status_menu']"
);

const GRID_VIEWER = cn(
  "grid gap-x-3 gap-y-1",
  "[grid-template-columns:minmax(0,1fr)] [grid-template-areas:'topic'_'status'_'members'_'producer'_'notes']",
  "@2xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] @2xl:[grid-template-areas:'topic_topic'_'status_status'_'members_producer'_'notes_notes']",
  "@4xl:gap-y-0 @4xl:[grid-template-columns:minmax(10.5rem,1.4fr)_minmax(9.5rem,1.2fr)_minmax(8.5rem,1fr)_minmax(10rem,1.2fr)_minmax(9rem,1fr)] @4xl:[grid-template-areas:'topic_members_producer_notes_status']"
);

const ROW_PADDING = "px-4 py-4 md:px-5 @4xl:py-3";
const HEADER_LABEL = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

function HeaderRow({ grid, canEdit }: { grid: string; canEdit: boolean }) {
  return (
    <div aria-hidden className={cn(grid, "hidden items-center border-b border-border px-4 py-2.5 md:px-5 @4xl:grid")}>
      <span className={cn(HEADER_LABEL, "pl-8 [grid-area:topic]")}>Topic</span>
      <span className={cn(HEADER_LABEL, "[grid-area:members]")}>Members</span>
      <span className={cn(HEADER_LABEL, "[grid-area:producer]")}>Producer</span>
      <span className={cn(HEADER_LABEL, "[grid-area:notes]")}>Interviews &amp; notes</span>
      <span className={cn(HEADER_LABEL, "[grid-area:status]")} title="Stages are tracked in Groups">
        Stage
      </span>
      {canEdit ? <span className="[grid-area:menu]" /> : null}
    </div>
  );
}

/** One line of a skeleton cell: the same 40px (cards) / 32px (table) line as the real cells. */
const SKELETON_LINE = "flex h-10 items-center @4xl:h-8";

function SkeletonRow({ grid, canEdit }: { grid: string; canEdit: boolean }) {
  return (
    <li aria-hidden className={cn(grid, ROW_PADDING, "border-b border-border last:border-b-0")}>
      <div className={cn(SKELETON_LINE, "gap-2 [grid-area:topic]")}>
        <Skeleton className="h-3 w-5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className={cn(SKELETON_LINE, "gap-1 [grid-area:members]")}>
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-6 w-12" />
      </div>
      <div className={cn(SKELETON_LINE, "[grid-area:producer]")}>
        <Skeleton className="h-4 w-24" />
      </div>
      <div className={cn(SKELETON_LINE, "[grid-area:notes]")}>
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className={cn(SKELETON_LINE, "[grid-area:status]")}>
        <Skeleton className="h-[18px] w-24" />
      </div>
      {canEdit ? (
        <div className="flex justify-end [grid-area:menu]">
          <Skeleton className="h-10 w-10 rounded-md @4xl:h-8 @4xl:w-8" />
        </div>
      ) : null}
    </li>
  );
}

/** The table-shaped loading rows on their own (route loading.tsx). */
export function RosterSkeleton({ canEdit = true, rows = 6 }: { canEdit?: boolean; rows?: number }) {
  const grid = canEdit ? GRID_EDITOR : GRID_VIEWER;
  return (
    <div className="@container">
      <HeaderRow grid={grid} canEdit={canEdit} />
      <ul aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonRow key={index} grid={grid} canEdit={canEdit} />
        ))}
      </ul>
    </div>
  );
}

export function RosterList({
  entries,
  totalCount,
  context,
  loading,
  loadError,
  cycleNumber,
  filterLabel,
  menuRowKey,
  buttonMenuKey,
  menuItemsFor,
  emptyAction,
  onRetry,
  onShowAll,
  onUpdateRow,
  onRowClick,
  onRowContextMenu,
  onMenuOpenChange
}: {
  entries: RosterEntry[];
  /** Rows in the whole roster (before the filter). */
  totalCount: number;
  context: RosterCellContext;
  loading: boolean;
  loadError: string | null;
  cycleNumber: number;
  filterLabel: string | null;
  /** The row a menu is open for (⋯ or right-click), tinted while it is open. */
  menuRowKey: string | null;
  /** The row whose ⋯ menu is open. */
  buttonMenuKey: string | null;
  menuItemsFor: (entry: RosterEntry) => MenuEntry[];
  /** The one primary action for an empty roster (editors). */
  emptyAction?: ReactNode;
  onRetry: () => void;
  onShowAll: () => void;
  onUpdateRow: (index: number, next: Partial<ProgressRow>) => void;
  onRowClick: () => void;
  onRowContextMenu: (entry: RosterEntry, event: ReactMouseEvent<HTMLElement>) => void;
  onMenuOpenChange: (entry: RosterEntry, open: boolean) => void;
}) {
  const grid = context.canEdit ? GRID_EDITOR : GRID_VIEWER;

  if (loadError && !loading) {
    return <ErrorState title={`Couldn't load Cycle ${cycleNumber}`} message={loadError} onRetry={onRetry} />;
  }

  if (!loading && totalCount === 0) {
    return (
      <EmptyState
        size="page"
        icon={ListChecks}
        title={`No groups in Cycle ${cycleNumber} yet`}
        description={context.canEdit ? "Add the first group to start this cycle's roster." : "Executives build the roster here."}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="@container">
      <HeaderRow grid={grid} canEdit={context.canEdit} />
      {!loading && entries.length === 0 ? (
        <EmptyState
          size="inline"
          title={`No groups match “${filterLabel ?? "this filter"}”.`}
          action={
            <Button type="button" variant="ghost" size="sm" onClick={onShowAll}>
              Show all
            </Button>
          }
        />
      ) : null}
      {loading ? (
        <p role="status" className="sr-only">
          Loading groups…
        </p>
      ) : null}
      <ul aria-label={`Groups in Cycle ${cycleNumber}`} aria-busy={loading || undefined}>
        {loading
          ? Array.from({ length: 6 }, (_, index) => <SkeletonRow key={index} grid={grid} canEdit={context.canEdit} />)
          : entries.map((entry) => {
              const { row, index, key, status } = entry;
              const update = (next: Partial<ProgressRow>) => onUpdateRow(index, next);
              const clickToEdit = context.canEdit && !context.editing;
              const menuOpen = menuRowKey === key;
              return (
                <li
                  key={key}
                  data-row-key={key}
                  data-menu-open={menuOpen || undefined}
                  onContextMenu={(event) => onRowContextMenu(entry, event)}
                  onClick={onRowClick}
                  title={clickToEdit ? "Click to edit" : undefined}
                  className={cn(
                    grid,
                    ROW_PADDING,
                    // The shared table row: Ink 3 on hover, and while its menu is open.
                    "group/row border-b border-border transition-colors last:border-b-0 hover:bg-[var(--ink-3)]",
                    menuOpen && "bg-[var(--ink-3)]",
                    clickToEdit && "cursor-pointer"
                  )}
                >
                  <TopicCell row={row} index={index} context={context} onUpdate={update} />
                  <MembersCell row={row} context={context} onUpdate={update} />
                  <ProducerCell row={row} rowKey={key} context={context} onUpdate={update} />
                  <NotesCell row={row} context={context} onUpdate={update} />
                  <StatusCell status={status} topic={row.groupTopic} />
                  {context.canEdit ? (
                    <RowMenu
                      topic={row.groupTopic}
                      open={buttonMenuKey === key}
                      disabled={context.locked}
                      items={menuItemsFor(entry)}
                      onOpenChange={(open) => onMenuOpenChange(entry, open)}
                    />
                  ) : null}
                </li>
              );
            })}
      </ul>
    </div>
  );
}
