"use client";

import { memo, type DragEvent, type MouseEvent } from "react";
import { Check, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { VideoCardMenu, type DropdownOption } from "@/components/video-card-menu";
import { Button } from "@/components/ui/button";
import {
  APPROVAL_STATUSES,
  approvalOptionState,
  approvalTagLabel,
  deletedLabel,
  formatApprovalLabel,
  formatMemberNameSummary,
  formatTileDateLabel,
  getReadableStatus,
  thumbState
} from "@/components/project-assets/format";
import { AssetThumb } from "@/components/project-assets/media-thumb";
import { PeopleControl } from "@/components/project-assets/people-popover";
import { ApprovalTag, MediaStatusTag } from "@/components/project-assets/status-tags";
import type {
  ActiveUpload,
  ApprovalStatusValue,
  MediaTileItem,
  MediaTileVersion,
  ScopeMode
} from "@/components/project-assets/types";
import { useDateZone } from "@/components/project-assets/use-hydrated";
import { cn } from "@/src/lib/utils";

/** In-card buttons: 32px, 40px on touch screens. */
const CARD_BUTTON = "[@media(hover:none)]:h-10";

/** Stable handlers from ProjectMediaTiles (identity never changes, so memoized cards skip re-renders). */
export type AssetActions = {
  toggleSelect: (mediaId: string) => void;
  openReview: (href: string) => void;
  prefetch: (href: string) => void;
  dragStart: (event: DragEvent<HTMLElement>, mediaId: string) => void;
  dragEnd: () => void;
  selectVersion: (mediaId: string, versionId: string) => void;
  requestStatusChange: (mediaId: string, versionId: string, status: ApprovalStatusValue, airedAt: string | null) => void;
  uploadVersion: (mediaId: string) => void;
  moveIntoVersion: (mediaId: string) => void;
  downloadOriginal: (mediaId: string, versionId: string, title: string, versionNumber: number) => void;
  rename: (mediaId: string) => void;
  syncTurnedIn: (mediaId: string) => void;
  softDelete: (mediaId: string) => void;
  restore: (mediaId: string) => void;
  permanentDelete: (mediaId: string) => void;
  setPeopleOpen: (mediaId: string, open: boolean) => void;
  removePerson: (mediaId: string, userId: string) => void;
  addPeople: (mediaId: string) => void;
};

/** What this viewer may do here (one memoized object for the whole page). */
export type AssetContext = {
  scope: ScopeMode;
  canUpload: boolean;
  canManageProjectMedia: boolean;
  canManageVersionMeta: boolean;
  canSyncTurnedInDates: boolean;
  canChangeStatus: boolean;
  /** Final Cut folder in the active scope: people, Aired and turn-in sync. */
  showPackageActions: boolean;
  /** Restore / delete in progress (disables per-item buttons). */
  deleteBusy: boolean;
};

export type AssetItemProps = {
  item: MediaTileItem;
  activeVersion: MediaTileVersion;
  selected: boolean;
  dragging: boolean;
  upload: ActiveUpload | null;
  statusUpdating: boolean;
  syncingTurnedIn: boolean;
  membersBusy: boolean;
  peopleOpen: boolean;
  context: AssetContext;
  actions: AssetActions;
};

const REVIEW_OPEN_GUARD =
  "a,button,input,select,textarea,label,[role='button'],[contenteditable='true'],[data-prevent-review-open='true']";

/** Card/row click opens the review unless the click was on a control. */
export function shouldOpenReview(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return !target.closest(REVIEW_OPEN_GUARD);
}

/** Plain click on a review link opens it in a transition; modifier/middle clicks keep the browser's new tab. */
export function onReviewLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string, open: (href: string) => void) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  open(href);
}

/**
 * Why Status is locked. canManageVersionMeta is false for view (reviewer) access to the
 * workspace, which visibility-only viewers get too, so the hint says that, not a platform role.
 * (The approval-status route also requires associate producer or above; the menu doesn't check it.)
 */
function statusDisabledReason(context: AssetContext, statusUpdating: boolean) {
  if (context.scope !== "active") return "Restore it first";
  if (!context.canManageVersionMeta) return "View only";
  if (!context.canChangeStatus) return "Producers only";
  if (statusUpdating) return "Updating…";
  return undefined;
}

/** The ⋯ menu for one asset: same entries and gates on the card and the list row. */
export function AssetMenu({
  item,
  activeVersion,
  statusUpdating,
  syncingTurnedIn,
  context,
  actions,
  className
}: Pick<AssetItemProps, "item" | "activeVersion" | "statusUpdating" | "syncingTurnedIn" | "context" | "actions"> & {
  className?: string;
}) {
  const active = context.scope === "active";
  const zone = useDateZone();
  const disabledReason = statusDisabledReason(context, statusUpdating);
  const versionOptions: DropdownOption<string>[] = item.versions.map((version) => ({
    value: version.id,
    label: `v${version.versionNumber}`,
    hint: getReadableStatus(version.status)
  }));
  const statusOptions: DropdownOption<ApprovalStatusValue>[] = APPROVAL_STATUSES.map((status) => ({
    value: status,
    label: status === activeVersion.approvalStatus ? approvalTagLabel(activeVersion, zone) : formatApprovalLabel(status),
    ...approvalOptionState(activeVersion.approvalStatus, status)
  }));
  const canSyncTurnedIn =
    context.canSyncTurnedInDates && context.showPackageActions && active && activeVersion.sourceType === "VIDEO";

  return (
    <VideoCardMenu
      title={item.title}
      className={className}
      reviewHref={item.reviewHref}
      versionValue={activeVersion.id}
      versionOptions={versionOptions}
      onVersionChange={(versionId) => actions.selectVersion(item.id, versionId)}
      statusValue={activeVersion.approvalStatus}
      statusOptions={statusOptions}
      onStatusChange={(value) =>
        actions.requestStatusChange(item.id, activeVersion.id, value as ApprovalStatusValue, activeVersion.airedAt)
      }
      statusDisabled={disabledReason !== undefined}
      statusDisabledReason={disabledReason}
      onUploadNewVersion={active && context.canUpload ? () => actions.uploadVersion(item.id) : undefined}
      onMoveIntoVersion={active && context.canManageProjectMedia ? () => actions.moveIntoVersion(item.id) : undefined}
      onDownloadOriginal={
        activeVersion.sourceType === "VIDEO"
          ? () => actions.downloadOriginal(item.id, activeVersion.id, item.title, activeVersion.versionNumber)
          : undefined
      }
      onRename={
        active && context.canManageVersionMeta && activeVersion.sourceType === "VIDEO" ? () => actions.rename(item.id) : undefined
      }
      onSyncTurnedInDate={canSyncTurnedIn ? () => actions.syncTurnedIn(item.id) : undefined}
      syncTurnedInDisabled={syncingTurnedIn}
      onDelete={active ? () => actions.softDelete(item.id) : undefined}
      onRestore={active ? undefined : () => actions.restore(item.id)}
      onDeletePermanently={active ? undefined : () => actions.permanentDelete(item.id)}
      deleteBusy={context.deleteBusy}
    />
  );
}

/** The selection box on a thumbnail: 28px on a scrim, 40px hit area; always shown on touch. */
export function SelectBox({
  title,
  selected,
  onToggle,
  className
}: {
  /** The video's title, for the accessible name ("Select Robotics team"). */
  title: string;
  selected: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`Select ${title}`}
      title={selected ? "Selected" : "Select"}
      className={cn(
        "relative grid h-7 w-7 place-items-center rounded-sm bg-black/60 transition-opacity after:absolute after:-inset-1.5 after:content-[''] hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        className
      )}
    >
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-sm border",
          selected ? "border-[var(--brand-fill)] bg-[var(--brand-fill)]" : "border-[var(--soft-white)]/80"
        )}
      >
        {selected ? <Check className="h-3 w-3 text-[var(--on-brand)]" strokeWidth={3} aria-hidden /> : null}
      </span>
    </button>
  );
}

export function CommentCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 font-mono-broadcast text-xs tabular-nums text-muted-foreground", className)}
      title={`${count} comments`}
    >
      <MessageSquare className="h-4 w-4" aria-hidden />
      {count}
      <span className="sr-only"> comments</span>
    </span>
  );
}

/** The title link on a card or row: a real link, with a focus ring. */
export const TITLE_LINK =
  "rounded-sm text-sm font-semibold leading-5 text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/**
 * An asset in the grid. Equal height in its row: thumbnail, then title + ⋯, a status slot (one
 * tag: Uploading / Processing / Failed while the version isn't ready, otherwise its approval)
 * with the comment count, the uploader and date, and — in contexts that have them — people
 * (Final Cut) or Restore / Delete (Recently deleted).
 */
export const AssetCard = memo(function AssetCard({
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

  return (
    <article
      draggable={!deleted}
      onDragStart={(event) => actions.dragStart(event, item.id)}
      onDragEnd={actions.dragEnd}
      onMouseEnter={() => actions.prefetch(item.reviewHref)}
      onFocus={() => actions.prefetch(item.reviewHref)}
      onClick={(event) => {
        if (shouldOpenReview(event)) actions.openReview(item.reviewHref);
      }}
      className={cn(
        "group relative flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border bg-card transition",
        dragging
          ? "scale-[0.985] border-[var(--brand-green)]/50 opacity-60"
          : selected
            ? "border-[var(--brand-green)] bg-[var(--brand-green)]/[0.06]"
            : "border-border hover:border-[var(--ink-4)]"
      )}
    >
      <AssetThumb
        href={item.reviewHref}
        title={item.title}
        version={activeVersion}
        status={thumb.status}
        progress={thumb.progress}
        etaSeconds={upload?.etaSeconds ?? null}
        onOpen={actions.openReview}
        topLeft={<SelectBox title={item.title} selected={selected} onToggle={() => actions.toggleSelect(item.id)} />}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        {/* Phones keep two title lines so the rows below line up across a grid row. */}
        <div className="flex min-w-0 items-start gap-1">
          <a
            href={item.reviewHref}
            draggable={false}
            onClick={(event) => onReviewLinkClick(event, item.reviewHref, actions.openReview)}
            title={item.title}
            className={cn(TITLE_LINK, "min-w-0 flex-1 py-1.5 max-sm:line-clamp-2 max-sm:min-h-[3.25rem] sm:truncate")}
          >
            {item.title}
          </a>
          <AssetMenu
            item={item}
            activeVersion={activeVersion}
            statusUpdating={statusUpdating}
            syncingTurnedIn={syncingTurnedIn}
            context={context}
            actions={actions}
            className="-mr-1.5 shrink-0 [@media(hover:none)]:-my-1"
          />
        </div>

        <div className="flex min-h-5 min-w-0 items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {thumb.status ? <MediaStatusTag status={thumb.status} /> : <ApprovalTag version={activeVersion} zone={zone} />}
          </span>
          <CommentCount count={activeVersion.commentCount} className="h-5" />
        </div>

        <p className="truncate text-[13px] text-muted-foreground">
          {deleted
            ? deletedLabel(item, zone)
            : `${activeVersion.createdByName} · ${formatTileDateLabel(activeVersion.createdAt, zone)}`}
        </p>

        {showPeople ? (
          <div className="mt-auto pt-1">
            <PeopleControl
              title={item.title}
              summary={formatMemberNameSummary(item.assignedMembers, zone)}
              members={item.assignedMembers}
              open={peopleOpen}
              busy={membersBusy}
              onOpenChange={(open) => actions.setPeopleOpen(item.id, open)}
              onRemove={(userId) => actions.removePerson(item.id, userId)}
              onAddPeople={() => actions.addPeople(item.id)}
            />
          </div>
        ) : null}

        {deleted ? (
          <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={context.deleteBusy}
              onClick={() => actions.restore(item.id)}
              className={cn(CARD_BUTTON, "px-2 max-sm:[&>svg]:hidden")}
            >
              <RotateCcw aria-hidden />
              Restore
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive-quiet"
              disabled={context.deleteBusy}
              onClick={() => actions.permanentDelete(item.id)}
              className={cn(CARD_BUTTON, "px-2 max-sm:[&>svg]:hidden")}
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
});
