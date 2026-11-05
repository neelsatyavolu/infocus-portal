"use client";

import { Fragment, type ReactNode } from "react";
import { CalendarRange } from "lucide-react";
import { ExternalLink } from "@/components/announcements/external-link";
import { COARSE_HIT_AREA, ROW_CONTROL } from "@/components/announcements/sizes";
import { CopyTextButton } from "@/components/copy-text-button";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import {
  airWindowFor,
  formatAnnouncementCopy,
  runOnLabel,
  submittedAnnouncementBucketId,
  submitterKindLabel,
  type SubmittedAnnouncementBucketId
} from "@/src/lib/announcement-submission";
import { cn } from "@/src/lib/utils";

export type SubmittedAnnouncement = {
  id: string;
  timestamp: string;
  timestampIso: string | null;
  name: string;
  email: string;
  category: string;
  submitterKind: string;
  runOn: string;
  announcement: string;
  startDate: string;
  startDateIso: string | null;
  endDate: string;
  endDateIso: string | null;
  mediaLink: string;
  moreInfo: string;
  source: "native" | "google-sheets";
  isPermanent?: boolean;
};

function formatDate(value: string, iso: string | null) {
  const key = iso?.slice(0, 10);
  const source = key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : value;
  if (!source) {
    return "Not set";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    const [year, month, day] = source.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
  }

  return source;
}

function formatTimestamp(announcement: SubmittedAnnouncement) {
  const parsed = announcement.timestampIso ? new Date(announcement.timestampIso) : new Date(announcement.timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return announcement.timestamp || "Unknown time";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function asLink(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

export function windowFor(entry: SubmittedAnnouncement) {
  return airWindowFor(entry);
}

/** Items of one meta line with a dot between them. */
function MetaLine({ items, className }: { items: Array<{ key: string; node: ReactNode }>; className?: string }) {
  if (items.length === 0) return null;
  return (
    <p className={className}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? <span aria-hidden className="px-1.5 text-muted-foreground/60">·</span> : null}
          {item.node}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * One submission: a status row (where it runs, when), the text, optional notes, and a footer with
 * who sent it on the left and Copy / Delete on the right. Fills its grid cell, so cards in a row
 * are equal height with aligned footers.
 */
export function SubmittedAnnouncementCard({
  entry,
  hideEmail = false,
  onDelete,
  deleting = false,
  deleteDisabled = false,
  bucketId
}: {
  entry: SubmittedAnnouncement;
  hideEmail?: boolean;
  onDelete?: (entry: SubmittedAnnouncement) => void;
  deleting?: boolean;
  /** Keeps Delete in place but unusable (while the list refreshes). */
  deleteDisabled?: boolean;
  /** The section the card sits in, when the caller already knows it. */
  bucketId?: SubmittedAnnouncementBucketId;
}) {
  const infoUrl = asLink(entry.moreInfo);
  const mediaUrl = asLink(entry.mediaLink);
  const role = submitterKindLabel(entry.submitterKind);
  const destination = runOnLabel(entry.runOn) || entry.category;
  const copyText = formatAnnouncementCopy(entry.announcement);
  const moreInfoNote = entry.moreInfo.trim() && !infoUrl ? entry.moreInfo.trim() : "";
  const mediaNote = entry.mediaLink.trim() && !mediaUrl ? entry.mediaLink.trim() : "";
  const submitter = entry.name.trim() || "Unknown submitter";
  const email = hideEmail ? "" : entry.email.trim();
  const bucket = bucketId ?? submittedAnnouncementBucketId(entry);
  // Upcoming is the one section whose title doesn't say the day.
  const upcomingLabel = bucket === "upcoming" ? airWindowFor(entry).label : null;
  const name = `Announcement from ${submitter}`;

  const metaItems: Array<{ key: string; node: ReactNode }> = [
    email
      ? {
          key: "email",
          node: (
            <a
              href={`mailto:${email}`}
              className={cn("break-all underline-offset-2 hover:text-foreground hover:underline", COARSE_HIT_AREA)}
            >
              {email}
            </a>
          )
        }
      : null,
    { key: "submitted", node: <span>Submitted {formatTimestamp(entry)}</span> },
    mediaUrl ? { key: "media", node: <ExternalLink href={mediaUrl}>Media</ExternalLink> } : null,
    infoUrl ? { key: "info", node: <ExternalLink href={infoUrl}>More info</ExternalLink> } : null
  ].filter((item) => item !== null);

  return (
    <article aria-label={name} className="flex h-full min-w-0 flex-col rounded-md border border-border bg-card text-card-foreground">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-5">
        <div className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* The sheet's free-text category can be long: it wraps instead of truncating. */}
          {destination ? <StatusTag wrap>{destination}</StatusTag> : null}
          {upcomingLabel ? <StatusTag>{upcomingLabel}</StatusTag> : null}
          {entry.isPermanent ? (
            <StatusTag tone="success">Permanent</StatusTag>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {formatDate(entry.startDate, entry.startDateIso)}
                {" – "}
                {formatDate(entry.endDate, entry.endDateIso)}
              </span>
            </span>
          )}
        </div>

        <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-pretty text-foreground">{entry.announcement}</p>

        {mediaNote || moreInfoNote ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-[13px]">
            {mediaNote ? (
              <>
                <dt className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Media</dt>
                <dd className="break-words text-pretty text-[var(--ink-text)]">{mediaNote}</dd>
              </>
            ) : null}
            {moreInfoNote ? (
              <>
                <dt className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Notes</dt>
                <dd className="break-words text-pretty text-[var(--ink-text)]">{moreInfoNote}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-4 py-3 md:px-5">
        <div className="min-w-0 flex-[1_1_14rem] text-[13px] leading-5">
          <p className="truncate">
            <span className="font-medium text-foreground">{submitter}</span>
            {role ? <span className="text-muted-foreground"> · {role}</span> : null}
          </p>
          <MetaLine items={metaItems} className="flex flex-wrap items-center text-muted-foreground" />
        </div>
        {/* The group's name tells screen readers which submission Copy and Delete act on. */}
        <div role="group" aria-label={name} className="ml-auto flex shrink-0 items-center gap-2">
          <CopyTextButton text={copyText} size="sm" variant="outline" className={ROW_CONTROL} />
          {onDelete ? (
            <Button
              type="button"
              variant="destructive-quiet"
              size="sm"
              className={ROW_CONTROL}
              disabled={deleting || deleteDisabled}
              aria-label={deleting ? undefined : `Delete announcement from ${submitter}`}
              onClick={() => onDelete(entry)}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
