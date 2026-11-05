"use client";

import { memo } from "react";
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import { StageTrack } from "@/components/groups/stage-track";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";
import ApprovePitchButton from "./approve-pitch-button";
import GroupNotesButton from "./group-notes-button";
import type { GroupRowView } from "./group-row-model";

type Tag = { key: string; label: string; tone: StatusToneInput };

/** The tile's own status first; a grade the viewer still owes leads, a neutral grade state trails. */
function tileTags(view: GroupRowView): Tag[] {
  const status: Tag = { key: "status", label: view.tileStatus.label, tone: view.tileStatus.tone };
  const schedule: Tag[] = view.schedule ? [{ key: "schedule", label: view.schedule.label, tone: view.schedule.tone }] : [];
  const grades: Tag[] = view.gradesPill ? [{ key: "grades", label: view.gradesPill.label, tone: view.gradesPill.tone }] : [];
  const gradeOwed = view.gradesPill?.tone === "warn";
  return gradeOwed
    ? [...grades, status, ...schedule]
    : [status, ...schedule, ...grades];
}

/**
 * A group on the Groups board, kept compact so an assigned producer sees 4–5 groups at once.
 * The title is a stretched link to the group's pending stage, so the whole card opens it (J/K +
 * Enter too); Notes and Approve pitch sit above the link layer.
 * Anatomy: title with the pending stage on the right; people with check-ins on the right; the
 * stage track; then status tags, with any actions at the end of that same row (they wrap under
 * the tags when room runs out). The tag row sits right under the track; a shorter tile in a
 * stretched grid row takes the slack at its bottom, not above the tags.
 * A group waiting on someone else drops the card fill: quieter, with text at full contrast.
 */
function GroupTileBase({
  view,
  onNotesSaved,
  onPitchApproved
}: {
  view: GroupRowView;
  onNotesSaved: (rowId: string, value: string) => void;
  onPitchApproved: (rowId: string) => void;
}) {
  const rowId = view.row.id;
  const people = `${view.memberNames} · AP ${view.apName} · EP ${view.epName}`;
  const canNotes = Boolean(rowId && view.canNotes);
  const canApprovePitch = Boolean(rowId && view.canApprovePitch);
  return (
    <article
      className={cn(
        "relative flex h-full min-w-0 flex-col gap-3 rounded-md border p-4 transition-colors hover:bg-[var(--ink-3)]/40",
        view.attention === "waiting" ? "bg-transparent" : "bg-card",
        view.attention === "needed"
          ? "border-[var(--brand-green)]/55 hover:border-[var(--brand-green)]/80"
          : "border-border hover:border-[var(--brand-green)]/45"
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-foreground" title={view.topic}>
            {view.href ? (
              <Link
                href={view.href as never}
                data-group-tile=""
                className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--brand-green)]"
              >
                {view.topic}
              </Link>
            ) : (
              view.topic
            )}
          </h3>
          <span
            title="Pending stage"
            className="shrink-0 text-[11px] font-medium uppercase leading-5 tracking-[0.11em] text-foreground"
          >
            {view.pendingLabel}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-3">
          <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted-foreground" title={people}>
            {view.memberNames}
            <span aria-hidden className="mx-1.5 text-border">·</span>
            AP {view.apName}
            <span aria-hidden className="mx-1.5 text-border">·</span>
            EP {view.epName}
          </p>
          <span title="Check-in points" className="shrink-0 font-mono-broadcast text-xs leading-5 tabular-nums text-muted-foreground">
            <span className="sr-only">Check-in points </span>
            <span className="text-foreground">{view.checkIns}</span>/{MAX_CHECK_IN_POINTS_PER_CYCLE}
          </span>
        </div>
      </div>

      <StageTrack segments={view.segments} />

      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2">
        {tileTags(view).map((tag) => (
          <StatusTag key={tag.key} tone={tag.tone}>
            {tag.label}
          </StatusTag>
        ))}
        {view.extensionLabel ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5" aria-hidden />
            {view.extensionLabel}
          </span>
        ) : null}
        {canNotes || canApprovePitch ? (
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2">
            {rowId && canNotes ? (
              <GroupNotesButton
                rowId={rowId}
                topic={view.row.groupTopic}
                hasNotes={Boolean(view.row.possibleIdeas?.trim())}
                onSaved={(value) => onNotesSaved(rowId, value)}
              />
            ) : null}
            {rowId && canApprovePitch ? (
              <ApprovePitchButton rowId={rowId} onApproved={() => onPitchApproved(rowId)} />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const GroupTile = memo(GroupTileBase);
