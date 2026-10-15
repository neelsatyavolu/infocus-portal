"use client";

import type { ReactNode } from "react";
import { ChevronsUpDown, PanelLeftClose, Pencil, Trash2 } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu } from "@/components/kit/menu";
import { cn } from "@/src/lib/utils";
import {
  countSectionsToFill,
  formatAge,
  latestDocUpdate,
  pluralize,
  primaryDocStatus,
  railDateParts,
  type DocStatusContext,
  type TeleprompterDoc
} from "./teleprompter-model";
import { DocStatusTag, PaneHeader, ReformattingTag, STICKY_TOP, ToFillCount, UpdatedMark } from "./teleprompter-parts";

/** Weekday caps over MM/DD in Geist Mono, so dates line up as a column. */
function RailDate({ showDate }: { showDate: string | null }) {
  const parts = railDateParts(showDate);
  return (
    <span className="flex w-12 shrink-0 flex-col justify-center leading-none" aria-hidden={parts ? undefined : true}>
      {parts ? (
        <>
          <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{parts.weekday}</span>
          <span className="mt-1.5 font-mono-broadcast text-xs tabular-nums text-[var(--ink-text)]">{parts.date}</span>
        </>
      ) : (
        <span className="font-mono-broadcast text-xs text-muted-foreground">—</span>
      )}
    </span>
  );
}

/**
 * Line 2 of a script row: the section count and ONE status (TODAY > NEXT SHOW > TO FILL > NO
 * SECTIONS), or Reformatting nn% while the whole script is being reformatted.
 */
function DocMetaLine({ doc, statusContext, progress = null }: { doc: TeleprompterDoc; statusContext: DocStatusContext; progress?: number | null }) {
  const status = primaryDocStatus(doc, statusContext);
  const toFill = countSectionsToFill(doc);
  const showFillCount = toFill > 0 && (status?.kind === "today" || status?.kind === "next-show");
  return (
    <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">{pluralize(doc.sections.length, "section")}</span>
      {progress !== null ? (
        <ReformattingTag progress={progress} />
      ) : (
        <>
          {status ? <DocStatusTag status={status} size="sm" /> : null}
          {showFillCount ? <ToFillCount count={toFill} /> : null}
        </>
      )}
    </span>
  );
}

/**
 * Row gutters: the desktop rail matches its pane header (12px); the Scripts sheet matches the
 * sheet's header (16px, 20px from md), with the ⋯ box where the sheet's Close box sits.
 */
const ROW_INSET = {
  rail: { start: "pl-3", end: "pr-3" },
  sheet: { start: "pl-4 md:pl-5", end: "pr-2 md:pr-3" }
} as const;

export type ScriptRailListProps = {
  docs: TeleprompterDoc[];
  hiddenCount: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  activeDocId: string | null;
  canEdit: boolean;
  statusContext: DocStatusContext;
  now: number;
  updatedSinceVisit: (doc: TeleprompterDoc) => boolean;
  onSelect: (docId: string) => void;
  onRename: (doc: TeleprompterDoc) => void;
  onDelete: (doc: TeleprompterDoc) => void;
  /** Which container the rows sit in, for matching gutters. */
  inset?: keyof typeof ROW_INSET;
};

/** The script rows (shared by the desktop rail and the phone Scripts sheet), plus Show more/less. */
export function ScriptRailList({
  docs,
  hiddenCount,
  showAll,
  onToggleShowAll,
  activeDocId,
  canEdit,
  statusContext,
  now,
  updatedSinceVisit,
  onSelect,
  onRename,
  onDelete,
  inset = "rail"
}: ScriptRailListProps) {
  const gutter = ROW_INSET[inset];
  return (
    <div>
      <ul aria-label="Scripts">
        {docs.map((doc) => {
          const selected = doc.id === activeDocId;
          const updated = updatedSinceVisit(doc);
          return (
            <li
              key={doc.id}
              className={cn(
                "group relative flex items-center border-b border-border transition-colors",
                selected
                  ? "bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--brand-green)]"
                  : "hover:bg-[var(--ink-3)]/60"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(doc.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  gutter.start,
                  canEdit ? "pr-1" : gutter.end
                )}
              >
                <RailDate showDate={doc.showDate} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span title={doc.title} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {doc.title}
                    </span>
                    {updated ? <UpdatedMark age={formatAge(latestDocUpdate(doc), now)} /> : null}
                  </span>
                  <DocMetaLine doc={doc} statusContext={statusContext} />
                </span>
              </button>
              {canEdit ? (
                <div className={cn("flex shrink-0 items-center", gutter.end)}>
                  <ActionMenu
                    label={`Actions for ${doc.title}`}
                    size="sm"
                    className={cn(
                      "pointer-coarse:h-10",
                      !selected &&
                        "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 data-[state=open]:opacity-100"
                    )}
                    items={[
                      { key: "rename", label: "Rename script", icon: Pencil, onSelect: () => onRename(doc) },
                      "separator",
                      { key: "delete", label: "Delete script", icon: Trash2, tone: "danger", onSelect: () => onDelete(doc) }
                    ]}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 || showAll ? (
        <button
          type="button"
          onClick={onToggleShowAll}
          className="flex h-10 w-full items-center justify-center text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {showAll ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </div>
  );
}

/** The desktop rail: a Scripts pane header and the rows, sticky under the top bar with its own scroll. */
export function ScriptRailPane({
  total,
  onHide,
  children
}: {
  total: number;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <aside aria-label="Scripts" className="min-w-0 border-r border-border">
      <div className={cn("sticky flex max-h-[calc(100dvh-var(--app-header-h,0px))] flex-col", STICKY_TOP)}>
        <PaneHeader
          label="Scripts"
          count={total}
          actions={<IconButton label="Hide scripts" icon={PanelLeftClose} size="sm" className="pointer-coarse:h-10" onClick={onHide} />}
        />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </aside>
  );
}

/**
 * Narrow screens: the open script as one card. Tapping it opens the Scripts sheet; `trailing`
 * holds the ⋯ menu (Add section, Reformat all). One 16px gutter on both sides, the same as the
 * Rundown strip under it, so their right edges line up.
 */
export function ScriptSwitcherCard({
  doc,
  statusContext,
  progress,
  onOpen,
  trailing
}: {
  doc: TeleprompterDoc;
  statusContext: DocStatusContext;
  /** Whole-script reformat progress, or null. */
  progress: number | null;
  onOpen: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-2 border-b border-border", trailing ? "pr-4" : undefined)}>
      <h2 className="sr-only">{doc.title}</h2>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={cn(
          "flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-[var(--ink-3)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          trailing ? "pr-2" : "pr-4"
        )}
      >
        <RailDate showDate={doc.showDate} />
        <span className="min-w-0 flex-1">
          <span className="sr-only">Change script. Open: </span>
          <span title={doc.title} className="block truncate text-base font-semibold text-foreground">
            {doc.title}
          </span>
          <DocMetaLine doc={doc} statusContext={statusContext} progress={progress} />
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {trailing}
    </div>
  );
}
