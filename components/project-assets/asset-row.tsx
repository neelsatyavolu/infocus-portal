"use client";

import { memo, type MouseEvent } from "react";
import { MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AssetMenu,
  CommentCount,
  SelectBox,
  TITLE_LINK,
  onReviewLinkClick,
  shouldOpenReview,
  type AssetItemProps
} from "@/components/project-assets/asset-card";
import {
  deletedLabel,
  formatEtaCompact,
  formatMemberNameSummary,
  formatTileDateLabel,
  thumbState
} from "@/components/project-assets/format";
import { LIST_COLUMNS, LIST_ROW, PHONE_ONLY, VERSION_IN_META } from "@/components/project-assets/list-layout";
import { AssetThumb } from "@/components/project-assets/media-thumb";
import { PeopleControl } from "@/components/project-assets/people-popover";
import { ApprovalTag, MediaStatusTag } from "@/components/project-assets/status-tags";
import { useDateZone } from "@/components/project-assets/use-hydrated";
import { cn } from "@/src/lib/utils";

const HEADER_CELL = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

/**
 * Fixed so the columns before it line up with the header (Restore + Delete + ⋯ in Recently
 * deleted). In the phone row, Restore and Delete move into the ⋯ menu, leaving room for the title.
 */
function actionsWidth(deleted: boolean) {
  return deleted ? "@min-[36rem]:w-60 @max-[36rem]:w-8 @max-[36rem]:[@media(hover:none)]:w-10" : "w-8 [@media(hover:none)]:w-10";
}

/** "Uploading" / "Processing" / "Failed" plus the upload's ETA while it is sending. */
function MediaStatus({ status, etaSeconds }: { status: Parameters<typeof MediaStatusTag>[0]["status"]; etaSeconds: number | null | undefined }) {
  return (
    <>
      <MediaStatusTag status={status} size="sm" />
      {status === "UPLOADING" ? (
        <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">{formatEtaCompact(etaSeconds ?? null)}</span>
      ) : null}
    </>
  );
}

/** The List view's label row (hidden in the phone layout, where rows explain themselves). */
export function AssetListHeader({ showPeople, deleted }: { showPeople: boolean; deleted: boolean }) {
  return (
    <div aria-hidden className={cn(LIST_ROW, "hidden min-h-10! border-b border-border py-0 @min-[36rem]:flex", HEADER_CELL)}>
      <span className={LIST_COLUMNS.check} />
      <span className={LIST_COLUMNS.thumb} />
      <span className={LIST_COLUMNS.name}>Name</span>
      <span className={LIST_COLUMNS.version}>Version</span>
      <span className={LIST_COLUMNS.status}>{deleted ? "Deleted" : "Status"}</span>
      {showPeople ? (
        <span className={LIST_COLUMNS.people}>
          <span className="hidden @min-[44rem]:inline">People</span>
        </span>
      ) : null}
      <span className={LIST_COLUMNS.comments} title="Comments">
        <MessageSquare className="inline-block h-4 w-4" />
      </span>
      <span className={LIST_COLUMNS.uploaded}>Uploaded</span>
      <span className={cn(LIST_COLUMNS.actions, actionsWidth(deleted))} />
    </div>
  );
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * An asset in the List view: one 56px row (taller in the phone layout) with the same actions as
 * the card. Under the name: version (until its column shows), uploader, date (until its column
 * shows) and, in a Final Cut folder, people; the phone layout adds the status line below that.
 * Click anywhere that isn't a control to open the review; drag it onto a folder.
 */
export const AssetRow = memo(function AssetRow({
  item,
  activeVersion,
  selected,
  dragging,
  upload,
  statusUpdating,
  syncingTurnedIn,
  membersBusy,
  peopleOpen,
  context,
  actions
}: AssetItemProps) {
  const deleted = context.scope === "deleted";
  const thumb = thumbState(activeVersion, upload);
  const showPeople = context.showPackageActions && !deleted;
  const zone = useDateZone();
  const date = formatTileDateLabel(activeVersion.createdAt, zone);
  const deletedText = deleted ? deletedLabel(item, zone) : "";
  const peopleSummary = showPeople ? formatMemberNameSummary(item.assignedMembers, zone) : "";

  return (
    <li
      draggable={!deleted}
      onDragStart={(event) => actions.dragStart(event, item.id)}
      onDragEnd={actions.dragEnd}
      onMouseEnter={() => actions.prefetch(item.reviewHref)}
      onFocus={() => actions.prefetch(item.reviewHref)}
      onClick={(event) => {
        if (shouldOpenReview(event)) actions.openReview(item.reviewHref);
      }}
      className={cn(
        LIST_ROW,
        "group cursor-pointer transition-colors",
        dragging ? "opacity-60" : selected ? "bg-[var(--brand-green)]/[0.06]" : "hover:bg-[var(--ink-3)]"
      )}
    >
      <span className={LIST_COLUMNS.check} data-prevent-review-open="true" onClick={stop}>
        <Checkbox
          size="md"
          checked={selected}
          onCheckedChange={() => actions.toggleSelect(item.id)}
          aria-label={selected ? `Deselect ${item.title}` : `Select ${item.title}`}
        />
      </span>

      <span className={LIST_COLUMNS.thumb}>
        <AssetThumb
          href={item.reviewHref}
          title={item.title}
          version={activeVersion}
          status={thumb.status}
          progress={thumb.progress}
          etaSeconds={upload?.etaSeconds ?? null}
          size="row"
          showVersion={false}
          onOpen={actions.openReview}
          topLeft={
            <SelectBox
              title={item.title}
              selected={selected}
              onToggle={() => actions.toggleSelect(item.id)}
              className={cn(PHONE_ONLY, "opacity-100")}
            />
          }
        />
      </span>

      <span className={LIST_COLUMNS.name}>
        <a
          href={item.reviewHref}
          draggable={false}
          onClick={(event) => onReviewLinkClick(event, item.reviewHref, actions.openReview)}
          title={item.title}
          className={cn(TITLE_LINK, "block @min-[36rem]:truncate @max-[36rem]:line-clamp-2")}
        >
          {item.title}
        </a>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground" title={peopleSummary || undefined}>
          <span className={cn("font-mono-broadcast tabular-nums", VERSION_IN_META)}>v{activeVersion.versionNumber} · </span>
          {activeVersion.createdByName}
          <span className="@min-[60rem]:hidden"> · {date}</span>
          {peopleSummary ? ` · ${peopleSummary}` : null}
        </span>
        <span className={cn("mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", PHONE_ONLY)}>
          {deleted ? <span className="min-w-0 truncate">{deletedText}</span> : <ApprovalTag version={activeVersion} zone={zone} size="sm" />}
          {thumb.status ? <MediaStatus status={thumb.status} etaSeconds={upload?.etaSeconds} /> : null}
          <CommentCount count={activeVersion.commentCount} />
        </span>
      </span>

      <span className={cn(LIST_COLUMNS.version, "text-muted-foreground")}>v{activeVersion.versionNumber}</span>

      <span className={LIST_COLUMNS.status}>
        {deleted ? (
          <span className="min-w-0 text-[13px] leading-snug text-muted-foreground" title={deletedText}>
            {deletedText}
          </span>
        ) : (
          <>
            <ApprovalTag version={activeVersion} zone={zone} size="sm" />
            {thumb.status ? <MediaStatus status={thumb.status} etaSeconds={upload?.etaSeconds} /> : null}
          </>
        )}
      </span>

      {showPeople ? (
        <span className={LIST_COLUMNS.people}>
          <PeopleControl
            title={item.title}
            members={item.assignedMembers}
            open={peopleOpen}
            busy={membersBusy}
            layout="row"
            onOpenChange={(open) => actions.setPeopleOpen(item.id, open)}
            onRemove={(userId) => actions.removePerson(item.id, userId)}
            onAddPeople={() => actions.addPeople(item.id)}
          />
        </span>
      ) : null}

      <span className={cn(LIST_COLUMNS.comments, "text-muted-foreground")}>
        {activeVersion.commentCount > 0 ? activeVersion.commentCount : "–"}
      </span>

      <span className={cn(LIST_COLUMNS.uploaded, "text-muted-foreground")}>{date}</span>

      <span className={cn(LIST_COLUMNS.actions, actionsWidth(deleted))}>
        {deleted ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={context.deleteBusy}
              onClick={() => actions.restore(item.id)}
              aria-label={`Restore ${item.title}`}
              className="@max-[36rem]:hidden [@media(hover:none)]:h-10"
            >
              <RotateCcw aria-hidden />
              <span aria-hidden>Restore</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive-quiet"
              disabled={context.deleteBusy}
              onClick={() => actions.permanentDelete(item.id)}
              aria-label={`Delete ${item.title} permanently`}
              className="@max-[36rem]:hidden [@media(hover:none)]:h-10"
            >
              <Trash2 aria-hidden />
              <span aria-hidden>Delete</span>
            </Button>
          </>
        ) : null}
        <AssetMenu
          item={item}
          activeVersion={activeVersion}
          statusUpdating={statusUpdating}
          syncingTurnedIn={syncingTurnedIn}
          context={context}
          actions={actions}
        />
      </span>
    </li>
  );
});
