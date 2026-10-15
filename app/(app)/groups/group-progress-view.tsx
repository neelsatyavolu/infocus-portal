"use client";

import Link from "next/link";
import { Panel } from "@/components/kit/panel";
import { LoadingRegion, TableSkeleton } from "@/components/kit/skeleton";
import { StageStatusGroup, StageTotals, StageToggleGroup, type StageToggle } from "@/components/groups/stage-track";
import {
  MAX_CHECK_IN_POINTS_PER_CYCLE,
  PACKAGE_STAGE_LABELS,
  PACKAGE_STAGES,
  type PackageStage
} from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";
import { STAGE_SHORT, type ExecutiveBucket, type GroupRowView } from "./group-row-model";

// align-top: every caps label (these and the stage labels over the totals) shares the first line.
const HEAD_CELL =
  "px-3 pb-2 pt-3 align-top text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

function stageToggles(view: GroupRowView): StageToggle[] {
  return PACKAGE_STAGES.map((stage) => {
    const mediaLinked =
      (stage === "initialCut" && view.row.initialCutMediaItemId) || (stage === "finalCut" && view.row.finalCutMediaItemId);
    return {
      key: stage,
      label: STAGE_SHORT[stage],
      title: `${PACKAGE_STAGE_LABELS[stage]}${mediaLinked ? " · media linked" : ""}`,
      done: Boolean(view.row[stage])
    };
  });
}

/** `block` (phone rows): the whole 40px topic line is the link, not just the words. */
function TopicLink({ view, block = false }: { view: GroupRowView; block?: boolean }) {
  if (!view.href) {
    return block ? (
      <span className="flex min-h-10 min-w-0 items-center">
        <span className="min-w-0 truncate">{view.topic}</span>
      </span>
    ) : (
      <>{view.topic}</>
    );
  }
  return (
    <Link
      href={view.href as never}
      data-group-tile=""
      className={cn(
        "rounded-sm hover:text-[var(--brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        block && "flex min-h-10 min-w-0 items-center"
      )}
    >
      {block ? <span className="min-w-0 truncate">{view.topic}</span> : view.topic}
    </Link>
  );
}

function CheckIns({ value }: { value: number }) {
  return (
    <span className="font-mono-broadcast text-[13px] tabular-nums" title="Check-in points">
      <span className="text-foreground">{value}</span>
      <span className="text-muted-foreground">/{MAX_CHECK_IN_POINTS_PER_CYCLE}</span>
    </span>
  );
}

/**
 * The EP bucket header. `compact` (phone rows) shortens the caps label to "EP" and the count to
 * mono "5 · 2 done", so the name (the part that tells buckets apart) keeps the room.
 */
function BucketLabel({ bucket, compact = false }: { bucket: ExecutiveBucket; compact?: boolean }) {
  const count = bucket.views.length;
  const name = bucket.executiveName ?? "Unassigned";
  const countText = `${count} package${count === 1 ? "" : "s"}${
    bucket.completeCount > 0 ? ` · ${bucket.completeCount} complete` : ""
  }`;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        {compact ? (
          <>
            <span aria-hidden>EP</span>
            <span className="sr-only">Executive producer</span>
          </>
        ) : (
          "Executive producer"
        )}
      </span>
      <span className="min-w-0 truncate text-[13px] font-semibold text-foreground" title={name}>
        {name}
      </span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground" title={countText}>
        {compact ? (
          <>
            <span aria-hidden className="font-mono-broadcast tabular-nums">
              {count}
              {bucket.completeCount > 0 ? ` · ${bucket.completeCount} done` : ""}
            </span>
            <span className="sr-only">{countText}</span>
          </>
        ) : (
          countText
        )}
      </span>
    </div>
  );
}

/**
 * Editors get toggles; everyone else (associates) gets the same stages as read-only status.
 * Toggles also wait while fresh rows load, and for a row that hasn't been saved yet.
 */
function StageCells({
  view,
  canEdit,
  locked,
  onToggle,
  size = "sm"
}: Pick<ProgressProps, "canEdit" | "locked" | "onToggle"> & { view: GroupRowView; size?: "sm" | "touch" }) {
  const stages = stageToggles(view);
  const ariaLabel = `Stages for ${view.topic}`;
  if (!canEdit) return <StageStatusGroup stages={stages} size={size} ariaLabel={ariaLabel} />;
  return (
    <StageToggleGroup
      stages={stages}
      size={size}
      ariaLabel={ariaLabel}
      disabled={locked || !view.row.id}
      onToggle={(stage) => onToggle(view.row.id, stage as PackageStage)}
    />
  );
}

type StageTotal = { key: string; label: string; count: number };

type ProgressProps = {
  buckets: ExecutiveBucket[];
  totals: StageTotal[];
  total: number;
  canEdit: boolean;
  /** Fresh rows are loading (a cycle switch or Refresh): toggles wait, so a save never sends a stale roster. */
  locked: boolean;
  onToggle: (rowId: string | undefined, stage: PackageStage) => void;
};

function totalsSummary(totals: StageTotal[], total: number) {
  return `Stage totals: ${totals.map((item) => `${item.label} ${item.count} of ${total} done`).join(", ")}.`;
}

/** md+ (by the panel's own width): one table, so columns line up across every EP group. */
function ProgressTable({ buckets, totals, total, canEdit, locked, onToggle }: ProgressProps) {
  return (
    <table className="w-full table-fixed border-collapse text-left [&>tbody:last-child>tr:last-child]:border-b-0">
      <caption className="sr-only">{totalsSummary(totals, total)}</caption>
      <colgroup>
        <col />
        <col className="w-32" />
        <col className="w-[26rem]" />
        <col className="w-28" />
      </colgroup>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className={`${HEAD_CELL} pl-4 md:pl-5`}>
            Package
          </th>
          <th scope="col" className={HEAD_CELL}>
            Associate
          </th>
          <th scope="col" className="px-3 pb-2 pt-3 align-top">
            <span className="sr-only">Stages</span>
            <StageTotals totals={totals} total={total} aria-hidden />
          </th>
          <th scope="col" className={`${HEAD_CELL} whitespace-nowrap pr-4 text-right md:pr-5`}>
            Check-ins
          </th>
        </tr>
      </thead>
      {buckets.map((bucket) => (
        <tbody key={bucket.key}>
          <tr className="border-b border-border bg-muted/40">
            <th colSpan={4} scope="rowgroup" className="h-10 px-4 text-left font-normal md:px-5">
              <BucketLabel bucket={bucket} />
            </th>
          </tr>
          {bucket.views.map((view) => (
            <tr key={view.key} className="border-b border-border transition-colors hover:bg-[var(--ink-3)]/50">
              <th scope="row" className="py-2.5 pl-4 pr-3 text-left align-middle font-normal md:pl-5">
                <div className="truncate text-sm font-medium text-foreground" title={view.topic}>
                  <TopicLink view={view} />
                </div>
                <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {view.memberNames} · {view.contactLine}
                </div>
              </th>
              <td className="truncate px-3 align-middle text-[13px] text-muted-foreground" title={view.apName}>
                {view.apName}
              </td>
              <td className="px-3 py-2.5 align-middle">
                <StageCells view={view} canEdit={canEdit} locked={locked} onToggle={onToggle} />
              </td>
              <td className="pl-3 pr-4 text-right align-middle md:pr-5">
                <CheckIns value={view.checkIns} />
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

/** Narrow panels: the totals strip over stacked rows with full-width toggles, on one grid. */
function ProgressList({ buckets, totals, total, canEdit, locked, onToggle }: ProgressProps) {
  return (
    <div className="[&>section:last-child>ul]:border-b-0">
      <div className="border-b border-border px-4 py-3">
        <p className="sr-only">{totalsSummary(totals, total)}</p>
        <StageTotals totals={totals} total={total} aria-hidden />
      </div>
      {buckets.map((bucket) => (
        <section key={bucket.key} aria-label={`Executive producer ${bucket.executiveName ?? "Unassigned"}`}>
          <div className="flex h-10 items-center border-b border-border bg-muted/40 px-4">
            <BucketLabel bucket={bucket} compact />
          </div>
          <ul className="divide-y divide-border border-b border-border">
            {bucket.views.map((view) => (
              <li key={view.key} className="space-y-2 px-4 pb-3 pt-1">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 text-sm font-medium text-foreground" title={view.topic}>
                    <TopicLink view={view} block />
                  </div>
                  <CheckIns value={view.checkIns} />
                </div>
                <p className="truncate text-[13px] text-muted-foreground">
                  {view.memberNames} · AP {view.apName}
                </p>
                <StageCells view={view} canEdit={canEdit} locked={locked} onToggle={onToggle} size="touch" />
                <p className="text-[13px] text-muted-foreground">{view.contactLine}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const PANEL_TITLE = "Stage progress";
const EDIT_HINT = "Click a stage to mark complete or incomplete. Changes save automatically.";

/** The same panel header as the loaded view, so nothing jumps when the rows arrive. */
export function GroupProgressSkeleton({ canEdit }: { canEdit: boolean }) {
  return (
    <Panel padding="none" title={PANEL_TITLE} titleAs="h2" description={canEdit ? EDIT_HINT : undefined}>
      <LoadingRegion label="Loading groups…">
        <span className="sr-only">Loading groups…</span>
        <TableSkeleton
          rows={6}
          columns={["w-2/3", "w-1/2", "w-full", "w-1/3"]}
          className="rounded-none border-0 bg-transparent [&>div]:px-4 md:[&>div]:px-5"
        />
      </LoadingRegion>
    </Panel>
  );
}

/**
 * The Progress view: every visible group, bucketed by assigned executive producer. Stage totals
 * sit in the Stages header over the toggles they count. Editors click a stage to flip it; the
 * whole cycle roster saves in the background. The table swaps for stacked rows when the panel
 * is narrower than 56rem (a container query, so the sidebar's width is accounted for), which
 * keeps the Package column at about 15rem beside the 26rem stage and 7rem Check-ins columns.
 */
export function GroupProgressView(props: ProgressProps) {
  return (
    <Panel
      padding="none"
      title={PANEL_TITLE}
      titleAs="h2"
      description={props.canEdit ? EDIT_HINT : undefined}
      bodyClassName="@container"
    >
      <div className="hidden @min-[56rem]:block">
        <ProgressTable {...props} />
      </div>
      <div className="@min-[56rem]:hidden">
        <ProgressList {...props} />
      </div>
    </Panel>
  );
}
