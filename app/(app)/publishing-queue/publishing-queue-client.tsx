"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarX, History, Plus, Radio, RotateCw } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { SectionHeader } from "@/components/kit/section";
import { Spinner } from "@/components/kit/spinner";
import { CountBadge, StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MAX_PACKAGES_PER_SHOW } from "@/src/lib/publishing-queue";
import { AddPackageDialog } from "./add-package-dialog";
import { MoveToShowDialog, type MoveTarget } from "./move-to-show-dialog";
import { PastShowsDialog, pastRowAnchorId } from "./past-shows-dialog";
import { PublishConfirmDialog, type PublishTarget } from "./publish-confirm-dialog";
import PublishingManagers from "./publishing-managers";
import { QueuePackageRow } from "./queue-package-row";
import { QueueSkeleton } from "./queue-skeleton";
import { QueueSummary } from "./queue-summary";
import type { OccupiedOn, QueueData, QueueRow } from "./queue-types";
import { buildQueueView, countOnShow } from "./queue-view-model";
import { RECENT_PUBLICATIONS_ID, RecentPublications } from "./recent-publications";
import { ShowRundown, showAnchorId } from "./show-rundown";
import { usePublishingQueue } from "./use-publishing-queue";
import { useQueueDrag } from "./use-queue-drag";

const UNASSIGNED_ID = "queue-unassigned";

function liveRowAnchorId(rowId: string) {
  return `queue-row-${rowId}`;
}

/** Scrolls to a jump target and moves focus there, so keyboard users continue from it. */
function scrollToElement(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  if (!element.hasAttribute("tabindex") && element.tabIndex < 0) element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
}

/** The line under "Upcoming shows" when nothing is queued for a show. */
function emptyQueueSentence(canEdit: boolean, hasPast: boolean) {
  if (hasPast) return "Nothing upcoming. Open Past shows for earlier air dates.";
  return canEdit ? "Nothing queued yet. Add a package to fill the next show." : "Nothing queued yet.";
}

/** Focus ring for a Panel that a summary tile jumps to. */
const PANEL_JUMP_TARGET = "scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Publishing Queue. Producers: is every upcoming show covered, and is YouTube OK? Then fill or
 * move packages. Website managers (read-only): what is on YouTube, and where is the embed code?
 */
export default function PublishingQueueClient({ canEdit, initialData }: { canEdit: boolean; initialData: QueueData | null }) {
  const queue = usePublishingQueue(initialData);
  const { rows, upcoming, today, publishingConfigured, busyId } = queue;
  const [addOpen, setAddOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastFocusId, setPastFocusId] = useState<string | null>(null);
  // Targets stay set while their dialog animates closed; `open` is what closes it.
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; target: MoveTarget | null }>({ open: false, target: null });
  const [publishDialog, setPublishDialog] = useState<{ open: boolean; target: PublishTarget | null }>({
    open: false,
    target: null
  });
  // A show date or row id, ringed for a moment after a jump from a summary tile.
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const view = useMemo(() => buildQueueView(rows, upcoming, today), [rows, upcoming, today]);
  const occupiedOn = useCallback<OccupiedOn>((date, exclude) => countOnShow(rows, date, exclude), [rows]);
  const move = (rowId: string, showDate: string) => void queue.updateQueue(rowId, true, showDate);
  const drag = useQueueDrag({ rows, occupiedOn, onMove: move });
  const canPublish = canEdit && publishingConfigured === true;
  const { summary } = view;
  const hasPast = view.past.length > 0;
  const lastShow = view.shows[view.shows.length - 1];

  function jump(elementId: string, key: string) {
    scrollToElement(elementId);
    setFlash(key);
  }

  function openPast(focusRowId: string | null) {
    setPastFocusId(focusRowId);
    setPastOpen(true);
  }

  function jumpToFailed() {
    const failed = summary.firstFailed;
    if (!failed) return;
    if (failed.past) {
      openPast(failed.id);
      setFlash(failed.id);
    } else {
      jump(liveRowAnchorId(failed.id), failed.id);
    }
  }

  function openAdd() {
    setAddOpen(true);
    void queue.loadCandidates();
  }

  function changeAddOpen(open: boolean) {
    setAddOpen(open);
    if (!open) queue.stopCandidates();
  }

  function renderRow(row: QueueRow, place: "live" | "past" | "recent") {
    const busy = busyId === row.id;
    const anchorId = place === "past" ? pastRowAnchorId(row.id) : place === "live" ? liveRowAnchorId(row.id) : undefined;
    return (
      <QueuePackageRow
        key={row.id}
        row={row}
        canEdit={canEdit}
        anchorId={anchorId}
        busy={busy}
        dragging={drag.draggingId === row.id}
        highlighted={flash === row.id}
        dragProps={canEdit && place === "live" ? drag.rowDragProps(row, busy) : undefined}
        onMove={(target) =>
          setMoveDialog({
            open: true,
            target: { row: target, options: place === "past" ? view.pastOptions : upcoming, returnFocusId: anchorId }
          })
        }
        onPublish={canPublish ? (target) => setPublishDialog({ open: true, target: { row: target, returnFocusId: anchorId } }) : undefined}
        onRemove={(rowId) => void queue.updateQueue(rowId, false)}
      />
    );
  }

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={
          // The place, like the sibling hub tabs: The Show (producers) or Managers → Website.
          <>
            <Radio className="h-3 w-3" aria-hidden />
            {canEdit ? "The Show" : "Website"}
          </>
        }
        status={canEdit ? undefined : <StatusTag>Read only</StatusTag>}
        title="Publishing Queue"
        description={
          canEdit
            ? `New packages land on the next empty show; drag to stack up to ${MAX_PACKAGES_PER_SHOW} per show.`
            : "Packages lined up for each show. Open one for its video and embed code."
        }
        actions={
          // Managers reads its own roster, so it works while the queue loads or after a failed load.
          <>
            {canEdit ? <PublishingManagers /> : null}
            <Button type="button" variant="outline" onClick={() => openPast(null)}>
              <History aria-hidden />
              Past shows
              {hasPast ? (
                <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">{view.past.length}</span>
              ) : null}
            </Button>
            {canEdit ? (
              <Button type="button" onClick={openAdd}>
                <Plus aria-hidden />
                Add package
              </Button>
            ) : null}
          </>
        }
      />

      {queue.phase === "loading" ? <QueueSkeleton tiles={canEdit ? 3 : 2} /> : null}

      {queue.phase === "error" ? (
        <Alert
          tone="danger"
          action={
            <Button type="button" size="sm" variant="outline" disabled={queue.retrying} onClick={() => void queue.retry()}>
              {queue.retrying ? <Spinner /> : <RotateCw aria-hidden />}
              Try again
            </Button>
          }
        >
          Couldn&apos;t load the publishing queue.
        </Alert>
      ) : null}

      {queue.phase === "ready" ? (
        <>
          <QueueSummary
            summary={summary}
            canEdit={canEdit}
            publishingConfigured={publishingConfigured}
            onJumpToShow={(date) => jump(showAnchorId(date), date)}
            onJumpToUnassigned={() => scrollToElement(UNASSIGNED_ID)}
            onJumpToFailed={jumpToFailed}
            onShowPublished={canEdit ? undefined : () => scrollToElement(RECENT_PUBLICATIONS_ID)}
          />

          {!canEdit && view.recentPublished.length > 0 ? (
            <RecentPublications
              rows={view.recentPublished}
              className={PANEL_JUMP_TARGET}
              renderRow={(row) => renderRow(row, "recent")}
            />
          ) : null}

          {/* Packages with no show need action first, and they are not upcoming shows: their own section. */}
          {view.unassigned.length > 0 ? (
            <Panel
              id={UNASSIGNED_ID}
              title="No show assigned"
              titleAs="h2"
              padding="md"
              status={
                <CountBadge
                  count={view.unassigned.length}
                  tone={canEdit ? "warning" : "neutral"}
                  srLabel={`${view.unassigned.length} without a show`}
                />
              }
              description={canEdit ? "Drag each one onto a show, or use Move in its menu." : undefined}
              className={PANEL_JUMP_TARGET}
            >
              <div className="grid gap-3 sm:grid-cols-2">{view.unassigned.map((row) => renderRow(row, "live"))}</div>
            </Panel>
          ) : null}

          <SectionHeader
            title="Upcoming shows"
            description={
              !lastShow ? undefined : summary.liveCount === 0 ? (
                emptyQueueSentence(canEdit, hasPast)
              ) : (
                <>
                  <span className="font-mono-broadcast tabular-nums">{view.shows.length}</span>
                  {` show ${view.shows.length === 1 ? "day" : "days"} · through ${lastShow.shortLabel}`}
                </>
              )
            }
          />

          {view.shows.length > 0 ? (
            <ShowRundown
              shows={view.shows}
              canEdit={canEdit}
              draggingId={drag.draggingId}
              overDate={drag.overDate}
              highlightDate={flash}
              canDropOn={drag.canDropOn}
              showDropProps={drag.showDropProps}
              renderRow={(row) => renderRow(row, "live")}
            />
          ) : (
            <EmptyState
              icon={CalendarX}
              title="No show days coming up"
              description={
                // Packages without a show are listed above; never say the queue is empty then.
                view.unassigned.length > 0
                  ? "Packages without a show are listed above."
                  : emptyQueueSentence(canEdit, hasPast)
              }
              className="rounded-md border border-border bg-card"
            />
          )}
        </>
      ) : null}

      <PastShowsDialog
        open={pastOpen}
        onOpenChange={setPastOpen}
        canEdit={canEdit}
        past={view.past}
        focusRowId={pastFocusId}
        renderRow={(row) => renderRow(row, "past")}
      />

      {canEdit ? (
        <>
          <AddPackageDialog
            open={addOpen}
            onOpenChange={changeAddOpen}
            candidates={queue.candidates}
            candidatesStatus={queue.candidatesStatus}
            busyId={busyId}
            onAddCandidate={(rowId) => void queue.updateQueue(rowId, true)}
            onRetryCandidates={() => void queue.loadCandidates()}
            onCustomAdded={queue.afterCustomAdded}
          />
          <MoveToShowDialog
            open={moveDialog.open}
            target={moveDialog.target}
            occupiedOn={occupiedOn}
            onMove={move}
            onClose={() => setMoveDialog((current) => ({ ...current, open: false }))}
          />
          <PublishConfirmDialog
            open={publishDialog.open}
            target={publishDialog.target}
            onClose={() => setPublishDialog((current) => ({ ...current, open: false }))}
            onConfirm={(row) => void queue.publishNow(row)}
          />
        </>
      ) : null}
    </div>
  );
}
