"use client";

import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { MAX_PACKAGES_PER_SHOW } from "@/src/lib/publishing-queue";
import { cn } from "@/src/lib/utils";
import type { QueueRow } from "./queue-types";
import type { ShowView } from "./queue-view-model";
import type { ShowDropProps } from "./use-queue-drag";

/** Element id of a show's row, for the summary tiles' jump links. */
export function showAnchorId(date: string) {
  return `show-${date}`;
}

function EmptySlot({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "min-h-10 items-center justify-center rounded-md border border-dashed border-border px-3 text-center text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

/** The fill level in one form on every row and at every width: "0/2", "1/2", "2/2". */
function ShowCount({ count }: { count: number }) {
  const full = count >= MAX_PACKAGES_PER_SHOW;
  return (
    <StatusTag size="sm" tone={count === 0 ? "muted" : "neutral"} title={full ? "Full" : undefined}>
      <span aria-hidden className="font-mono-broadcast tracking-normal tabular-nums">
        {count}/{MAX_PACKAGES_PER_SHOW}
      </span>
      <span className="sr-only">
        {count} of {MAX_PACKAGES_PER_SHOW} packages{full ? ", full" : ""}
      </span>
    </StatusTag>
  );
}

/** Phones only, in place of "0/2": producers see a regular show that needs a package as a warning (as on the Next show tile). */
function OpenShowTag({ needsPackage }: { needsPackage: boolean }) {
  return needsPackage ? (
    <StatusTag size="sm" tone="warning" title="Needs a package">
      Empty
    </StatusTag>
  ) : (
    <StatusTag size="sm" tone="muted" title="No package yet">
      Open
    </StatusTag>
  );
}

function ShowRow({
  show,
  canEdit,
  dragActive,
  accepting,
  over,
  highlighted,
  dropProps,
  renderRow
}: {
  show: ShowView;
  canEdit: boolean;
  dragActive: boolean;
  accepting: boolean;
  over: boolean;
  highlighted: boolean;
  dropProps?: ShowDropProps;
  renderRow: (row: QueueRow) => ReactNode;
}) {
  const count = show.rows.length;
  const nextTag = show.isNext ? (show.relative === "Today" ? "Today" : "Next") : null;
  const subline = show.specialName ?? (nextTag === "Today" ? null : show.relative);
  const dropHere = over && accepting;

  return (
    <li
      id={showAnchorId(show.date)}
      tabIndex={-1}
      {...dropProps}
      className={cn(
        "grid scroll-mt-24 grid-cols-1 gap-x-3 gap-y-2 px-4 py-3 outline-none transition-[background-color,box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-2 xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)] xl:items-stretch",
        dropHere && "bg-primary/5 ring-2 ring-inset ring-[var(--brand-green)]/60",
        dragActive && !accepting && "opacity-60",
        highlighted && !dropHere && "ring-2 ring-inset ring-[var(--brand-green)]"
      )}
    >
      {/* Date column only from xl: below that (the full sidebar takes 240px from lg) it sits above the two slots, so they keep room for text. */}
      <div className="flex min-h-8 min-w-0 items-center justify-between gap-3 md:col-span-2 xl:col-span-1 xl:flex-col xl:items-start xl:justify-center xl:gap-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-snug text-foreground" title={show.dateLabel}>
            {show.dateLabel}
          </h3>
          {subline ? (
            <p
              className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
              title={
                show.specialName
                  ? `${show.specialName}. ${canEdit ? "Auto-assign skips special shows. Drag a package here." : "Special show."}`
                  : undefined
              }
            >
              {show.specialName ? <Star className="h-3 w-3 shrink-0" aria-hidden /> : null}
              {show.specialName ? <span className="sr-only">Special show: </span> : null}
              <span className="truncate">{subline}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {nextTag ? (
            <StatusTag size="sm" tone="success">
              {nextTag}
            </StatusTag>
          ) : null}
          {/* Phones: an empty show is just this line (no drop slot, since touch can't drag; Move is the phone path). */}
          {count === 0 ? (
            <span className="flex md:hidden">
              <OpenShowTag needsPackage={canEdit && !show.specialName} />
            </span>
          ) : null}
          <span className={cn("flex", count === 0 && "max-md:hidden")}>
            <ShowCount count={count} />
          </span>
        </div>
      </div>

      {show.rows.map((row) => (
        <div key={row.id} className="min-w-0">
          {renderRow(row)}
        </div>
      ))}

      {count === 0 ? (
        <EmptySlot className="hidden md:col-span-2 md:flex xl:min-h-14">
          {canEdit ? (dropHere ? "Drop here" : "Drop a package here") : "No package yet"}
        </EmptySlot>
      ) : null}
      {count === 1 && canEdit ? (
        <EmptySlot className="hidden md:flex">{dropHere ? "Drop here" : "Room for one more"}</EmptySlot>
      ) : null}
    </li>
  );
}

/**
 * The live list as a rundown: one row per show (date, then its two package slots), so "is every
 * show covered?" is a scan down one column. The whole row is the drop target.
 */
export function ShowRundown({
  shows,
  canEdit,
  draggingId,
  overDate,
  highlightDate,
  canDropOn,
  showDropProps,
  renderRow
}: {
  shows: ShowView[];
  canEdit: boolean;
  draggingId: string | null;
  overDate: string | null;
  highlightDate: string | null;
  canDropOn: (date: string) => boolean;
  showDropProps: (date: string) => ShowDropProps;
  renderRow: (row: QueueRow) => ReactNode;
}) {
  return (
    <ol aria-label="Upcoming shows" className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
      {shows.map((show) => (
        <ShowRow
          key={show.date}
          show={show}
          canEdit={canEdit}
          dragActive={canEdit && draggingId !== null}
          accepting={canEdit && canDropOn(show.date)}
          over={overDate === show.date}
          highlighted={highlightDate === show.date}
          dropProps={canEdit ? showDropProps(show.date) : undefined}
          renderRow={renderRow}
        />
      ))}
    </ol>
  );
}
