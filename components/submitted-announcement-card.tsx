"use client";

import { CalendarRange, ExternalLink } from "lucide-react";
import { CopyTextButton } from "@/components/copy-text-button";
import { Button } from "@/components/ui/button";
import {
  airWindowFor,
  formatAnnouncementCopy,
  runOnLabel,
  submitterKindLabel
} from "@/src/lib/announcement-submission";

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

export function SubmittedAnnouncementCard({
  entry,
  hideEmail = false,
  onDelete,
  deleting = false
}: {
  entry: SubmittedAnnouncement;
  hideEmail?: boolean;
  onDelete?: (entry: SubmittedAnnouncement) => void;
  deleting?: boolean;
}) {
  const infoUrl = asLink(entry.moreInfo);
  const mediaUrl = asLink(entry.mediaLink);
  const role = submitterKindLabel(entry.submitterKind);
  const destination = runOnLabel(entry.runOn) || entry.category;
  const copyText = formatAnnouncementCopy(entry.announcement);
  const moreInfoNote = entry.moreInfo.trim() && !infoUrl ? entry.moreInfo.trim() : "";
  const mediaNote = entry.mediaLink.trim() && !mediaUrl ? entry.mediaLink.trim() : "";
  const submitter = entry.name.trim() || "Unknown submitter";

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {destination ? <span className="font-medium text-foreground">{destination}</span> : null}
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="h-3.5 w-3.5" />
            {entry.isPermanent ? "Permanent" : (
              <>
                {formatDate(entry.startDate, entry.startDateIso)}
                {" – "}
                {formatDate(entry.endDate, entry.endDateIso)}
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <CopyTextButton text={copyText} />
          {onDelete ? (
            <Button type="button" variant="destructive-quiet" size="sm" disabled={deleting} onClick={() => onDelete(entry)}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-pretty text-foreground">{entry.announcement}</p>

      {mediaNote ? <p className="mt-2 text-sm text-pretty text-muted-foreground">{mediaNote}</p> : null}
      {moreInfoNote ? <p className="mt-2 text-sm text-pretty text-muted-foreground">{moreInfoNote}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{submitter}</span>
        {role ? <span>{role}</span> : null}
        {!hideEmail && entry.email.trim() ? (
          <a href={`mailto:${entry.email.trim()}`} className="underline-offset-2 hover:text-foreground hover:underline">
            {entry.email.trim()}
          </a>
        ) : null}
        <span>Submitted {formatTimestamp(entry)}</span>
        {mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
          >
            Media
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {infoUrl ? (
          <a
            href={infoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
          >
            More info
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
