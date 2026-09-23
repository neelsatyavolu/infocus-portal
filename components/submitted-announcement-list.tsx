"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyTextButton } from "@/components/copy-text-button";
import { SubmittedAnnouncementCard, type SubmittedAnnouncement } from "@/components/submitted-announcement-card";
import {
  formatAnnouncementListCopy,
  groupSubmittedAnnouncements,
  type SubmittedAnnouncementBucketId
} from "@/src/lib/announcement-submission";

const COUNT_STYLES: Record<SubmittedAnnouncementBucketId, string> = {
  permanent: "border-[var(--brand-green)]/40 bg-[var(--brand-green)]/15 text-[var(--brand-green)]",
  today: "border-[var(--brand-green)]/40 bg-[var(--brand-green)]/15 text-[var(--brand-green)]",
  tomorrow: "border-sky-300/35 bg-sky-400/10 text-sky-100",
  upcoming: "border-border bg-accent text-foreground",
  schoology: "border-border bg-muted text-muted-foreground",
  ended: "border-amber-300/35 bg-amber-400/10 text-amber-100",
  other: "border-border bg-muted text-muted-foreground"
};

function Section({
  title,
  count,
  tone,
  defaultOpen,
  copyText,
  children
}: {
  title: string;
  count: number;
  tone: SubmittedAnnouncementBucketId;
  defaultOpen: boolean;
  copyText: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {defaultOpen ? (
          <h2 className="flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground">
            {title}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${COUNT_STYLES[tone]}`}>
              {count}
            </span>
          </h2>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex min-h-10 items-center gap-2 text-left"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${COUNT_STYLES[tone]}`}>
              {count}
            </span>
          </button>
        )}
        <CopyTextButton text={copyText} label="Copy all" copiedLabel="Copied all" />
      </div>
      {open ? <div className="space-y-2">{children}</div> : null}
    </section>
  );
}

export function SubmittedAnnouncementList({
  announcements,
  hideEmail = false,
  hideEnded = false,
  onDelete,
  deletingId,
  empty
}: {
  announcements: SubmittedAnnouncement[];
  hideEmail?: boolean;
  hideEnded?: boolean;
  onDelete?: (entry: SubmittedAnnouncement) => void;
  deletingId?: string | null;
  empty: ReactNode;
}) {
  const buckets = useMemo(() => {
    const grouped = groupSubmittedAnnouncements(announcements);
    return hideEnded ? grouped.filter((bucket) => bucket.id !== "ended") : grouped;
  }, [announcements, hideEnded]);

  if (buckets.length === 0) {
    return empty;
  }

  return (
    <div className="space-y-6">
      {buckets.map((bucket) => (
        <Section
          key={bucket.id}
          title={bucket.title}
          count={bucket.entries.length}
          tone={bucket.id}
          defaultOpen={bucket.defaultOpen}
          copyText={formatAnnouncementListCopy(bucket.entries.map((entry) => entry.announcement))}
        >
          {bucket.entries.map((entry) => (
            <SubmittedAnnouncementCard
              key={entry.id}
              entry={entry}
              hideEmail={hideEmail}
              onDelete={onDelete}
              deleting={deletingId === entry.id}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}
