"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ROW_CONTROL } from "@/components/announcements/sizes";
import { CopyTextButton } from "@/components/copy-text-button";
import { SubmittedAnnouncementCard, type SubmittedAnnouncement } from "@/components/submitted-announcement-card";
import {
  formatAnnouncementListCopy,
  groupSubmittedAnnouncements,
  type SubmittedAnnouncementBucketId
} from "@/src/lib/announcement-submission";
import { cn } from "@/src/lib/utils";

/**
 * One bucket: a 40px header row (title and mono count on the left, Copy all on the right) over a
 * card grid. The grid follows its container, not the screen: two columns in the Portal, one in
 * the narrow public shared view. Ended starts folded; its whole title is the toggle, with the
 * chevron after the count so every section title starts at the same left edge as the cards.
 * Folded cards are not rendered until opened (Ended grows all year).
 */
function BucketSection({
  id,
  title,
  count,
  defaultOpen,
  forceOpen,
  copyText,
  children
}: {
  id: SubmittedAnnouncementBucketId;
  title: string;
  count: number;
  defaultOpen: boolean;
  forceOpen: boolean;
  copyText: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = forceOpen || open;
  const collapsible = !defaultOpen && !forceOpen;
  const titleId = `submitted-${id}-title`;
  const bodyId = `submitted-${id}-cards`;
  const countTag = (
    <span className="font-mono-broadcast text-[13px] font-normal tabular-nums text-muted-foreground">
      <span className="sr-only">, </span>
      {count}
    </span>
  );

  return (
    <section aria-labelledby={titleId}>
      <div className="flex min-h-10 min-w-0 items-center justify-between gap-3">
        <h2 id={titleId} className="min-w-0 text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => setOpen((current) => !current)}
              className="inline-flex min-h-10 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
              {countTag}
              <ChevronDown
                aria-hidden
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")}
              />
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              {title}
              {countTag}
            </span>
          )}
        </h2>
        <CopyTextButton
          text={copyText}
          label="Copy all"
          copiedLabel="Copied all"
          size="sm"
          variant="outline"
          className={cn("shrink-0", ROW_CONTROL)}
        />
      </div>
      <div id={bodyId} hidden={!expanded} className="@container mt-3">
        {expanded ? <div className="grid gap-3 @3xl:grid-cols-2">{children}</div> : null}
      </div>
    </section>
  );
}

export function SubmittedAnnouncementList({
  announcements,
  hideEmail = false,
  hideEnded = false,
  onDelete,
  deletingId,
  deleteDisabled = false,
  bucket = null,
  empty
}: {
  announcements: SubmittedAnnouncement[];
  hideEmail?: boolean;
  hideEnded?: boolean;
  onDelete?: (entry: SubmittedAnnouncement) => void;
  deletingId?: string | null;
  /** Keeps Delete buttons in place but unusable (while the list refreshes). */
  deleteDisabled?: boolean;
  /** Show only this section, unfolded. Ignored when that section is empty. */
  bucket?: SubmittedAnnouncementBucketId | null;
  empty: ReactNode;
}) {
  const buckets = useMemo(() => {
    const grouped = groupSubmittedAnnouncements(announcements);
    return hideEnded ? grouped.filter((group) => group.id !== "ended") : grouped;
  }, [announcements, hideEnded]);

  if (buckets.length === 0) {
    return empty;
  }

  const only = bucket && buckets.some((group) => group.id === bucket) ? bucket : null;
  const shown = only ? buckets.filter((group) => group.id === only) : buckets;

  return (
    <div className="space-y-6">
      {shown.map((group) => (
        <BucketSection
          key={group.id}
          id={group.id}
          title={group.title}
          count={group.entries.length}
          defaultOpen={group.defaultOpen}
          forceOpen={group.id === only}
          copyText={formatAnnouncementListCopy(group.entries.map((entry) => entry.announcement))}
        >
          {group.entries.map((entry) => (
            <SubmittedAnnouncementCard
              key={entry.id}
              entry={entry}
              hideEmail={hideEmail}
              onDelete={onDelete}
              deleting={deletingId === entry.id}
              deleteDisabled={deleteDisabled}
              bucketId={group.id}
            />
          ))}
        </BucketSection>
      ))}
    </div>
  );
}
