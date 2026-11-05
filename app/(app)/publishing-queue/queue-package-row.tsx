"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Download,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Trash2,
  Upload
} from "lucide-react";
import { ActionMenu, type MenuEntry } from "@/components/kit/menu";
import { MediaThumb } from "@/components/kit/media";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { queuePackageSubtitle } from "@/src/lib/publishing-queue";
import { cn } from "@/src/lib/utils";
import type { QueueRow } from "./queue-types";
import { queueRowTitle, youtubeStatusView } from "./queue-view-model";
import type { RowDragProps } from "./use-queue-drag";

/** Same request as before the redesign: the server answers with a 302 to the original file. */
function downloadFinalCut(rowId: string) {
  const link = document.createElement("a");
  link.href = `/api/package-cycle/queue/${rowId}/download`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const ROW_BOX = "rounded-md border border-border bg-background p-2";
/** Jump targets (summary tiles) take focus, so keyboard users land where the page scrolled. */
const FOCUS_TARGET = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Puts focus back on a row's ⋯ trigger after a dialog opened from its menu closes (the menu is
 * gone by then, so the dialog has nothing of its own to return to). True only when focus moved.
 */
export function focusRowMenu(anchorId: string | undefined) {
  const trigger = anchorId ? document.getElementById(anchorId)?.querySelector<HTMLElement>("[aria-haspopup]") : null;
  if (!trigger) return false;
  trigger.focus();
  return document.activeElement === trigger;
}

/**
 * One queued package: thumbnail, topic (2 lines), headline, YouTube status tag and subtitle.
 * Producers drag it by its body onto a show and get a ⋯ menu (Move, Publish, Download, Open,
 * Remove) outside the drag area. Website managers get the whole row as one link to the package
 * page (its embed code).
 */
export function QueuePackageRow({
  row,
  canEdit,
  anchorId,
  busy = false,
  dragging = false,
  highlighted = false,
  dragProps,
  onMove,
  onPublish,
  onRemove
}: {
  row: QueueRow;
  canEdit: boolean;
  /** Element id, so the summary tiles can scroll to this row. */
  anchorId?: string;
  busy?: boolean;
  dragging?: boolean;
  /** Briefly ringed after a jump from a summary tile. */
  highlighted?: boolean;
  /** Producers on the live rundown only. */
  dragProps?: RowDragProps;
  onMove?: (row: QueueRow) => void;
  /** Only when YouTube publishing is configured. */
  onPublish?: (row: QueueRow) => void;
  onRemove?: (rowId: string) => void;
}) {
  const title = queueRowTitle(row);
  const status = youtubeStatusView(row.youtubePublication?.status);
  // Rows say "Pending" (as before the redesign); the package page says "Not published".
  const statusLabel = status.key === "none" ? "Pending" : status.label;
  const headline = row.headline && row.headline !== row.groupTopic ? row.headline : null;
  const lastError = row.youtubePublication?.lastError;
  const linkToGroups = canEdit && !row.custom;
  const packageHref = `/publishing-queue/${row.id}`;

  // Topic, headline and subtitle wrap in full (as before the redesign): phones can't hover for a tooltip.
  const text = (
    <div className="min-w-0">
      <p className="break-words text-sm font-medium leading-snug text-foreground">
        {linkToGroups ? (
          <Link
            href={`/groups/${row.id}/final-cut` as never}
            draggable={false}
            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </p>
      {headline ? (
        <p className="break-words text-[13px] leading-snug text-[var(--ink-text)]">{headline}</p>
      ) : null}
      <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {/* Status only, never a control: producers open the package page from the ⋯ menu. */}
        <StatusTag size="sm" tone={status.tone} srLabel="YouTube: " title={`YouTube: ${statusLabel}`}>
          {statusLabel}
        </StatusTag>
        <span className="min-w-0 break-words">{queuePackageSubtitle(row)}</span>
      </p>
    </div>
  );

  // The whole message, as before the redesign: it is the only place a phone can read it.
  const errorLine = lastError ? (
    <p className="col-span-full flex min-w-0 items-start gap-1.5 text-xs text-danger">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">YouTube: {lastError}</span>
    </p>
  ) : null;

  const thumb = <MediaThumb src={row.thumbnailUrl} size="sm" className="max-md:w-16" />;

  if (!canEdit) {
    return (
      <Link
        id={anchorId}
        href={packageHref as never}
        className={cn(
          ROW_BOX,
          "grid h-full min-h-11 scroll-mt-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          highlighted && "ring-2 ring-[var(--brand-green)]"
        )}
      >
        {thumb}
        {text}
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        {errorLine}
      </Link>
    );
  }

  // While a move, publish or remove runs, only the actions that change the queue wait for it.
  const items: MenuEntry[] = [
    { key: "move", label: "Move to another show…", icon: CalendarDays, disabled: busy, onSelect: () => onMove?.(row) },
    {
      key: "publish",
      label: "Publish to YouTube",
      icon: Upload,
      disabled: busy,
      onSelect: () => onPublish?.(row),
      hidden: !onPublish || Boolean(row.youtubePublication)
    },
    { key: "download", label: "Download final cut", icon: Download, onSelect: () => downloadFinalCut(row.id) },
    { key: "open", label: "Open package page", icon: ArrowUpRight, href: packageHref },
    "separator",
    {
      key: "remove",
      label: "Remove from queue",
      icon: Trash2,
      tone: "danger",
      disabled: busy,
      onSelect: () => onRemove?.(row.id)
    }
  ];

  const menuLabel = `Actions for ${title}`;

  return (
    <div
      id={anchorId}
      tabIndex={-1}
      className={cn(
        ROW_BOX,
        FOCUS_TARGET,
        "grid h-full scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 transition-[opacity,box-shadow]",
        dragging && "opacity-50",
        highlighted && "ring-2 ring-[var(--brand-green)]"
      )}
    >
      {/* The drag source: grip, thumbnail and text. The ⋯ menu sits outside it, so pressing it never starts a drag. */}
      <div
        {...dragProps}
        className={cn(
          "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3",
          dragProps && "md:grid-cols-[auto_auto_minmax(0,1fr)]",
          dragProps?.draggable && "md:cursor-grab md:active:cursor-grabbing"
        )}
      >
        {dragProps ? <GripVertical className="hidden h-4 w-4 text-muted-foreground md:block" aria-hidden /> : null}
        {thumb}
        {text}
      </div>
      <ActionMenu
        label={menuLabel}
        items={items}
        trigger={
          // Never disabled while busy: Download and Open package page stay usable, and focus can return here.
          <button
            type="button"
            draggable={false}
            aria-label={menuLabel}
            aria-busy={busy || undefined}
            title={menuLabel}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "max-md:h-10 max-md:w-10")}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            )}
          </button>
        }
      />
      {errorLine}
    </div>
  );
}
