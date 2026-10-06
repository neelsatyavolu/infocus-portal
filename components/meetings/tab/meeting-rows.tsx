"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { MeetingNotesStatusValue, MeetingSummary } from "@/src/lib/meetings/types";
import {
  canJoinNow,
  formatDuration,
  joinOpensAtMs,
  groupByPacificDay,
  pacificTimeLabel
} from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { meetingUrl } from "@/src/lib/meetings/links";
import { CopyLinkButton } from "./copy-link-button";
import { AgendaButton } from "@/components/meetings/agenda/agenda-button";

/** Tag text for restricted meetings; null for meetings every producer can join. */
export function accessTagLabel(meeting: Pick<MeetingSummary, "access" | "inviteeCount">) {
  if (meeting.access === "EXECS_ONLY") return "Execs only";
  if (meeting.access === "INVITE_ONLY") {
    return `Invite only · ${meeting.inviteeCount} ${meeting.inviteeCount === 1 ? "person" : "people"}`;
  }
  return null;
}

export function AccessTag({ meeting }: { meeting: MeetingSummary }) {
  const label = accessTagLabel(meeting);
  if (!label) return null;
  const Icon = meeting.access === "EXECS_ONLY" ? ShieldCheck : Lock;
  return (
    <span className="status-pill status-neutral">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

const NOTES: Record<MeetingNotesStatusValue, { label: string; className: string } | null> = {
  NONE: null,
  RECORDING: { label: "Recording", className: "status-neutral" },
  PROCESSING: { label: "Processing notes", className: "status-warn" },
  READY: { label: "Notes ready", className: "status-approved" },
  FAILED: { label: "Notes failed", className: "status-danger" }
};

export function NotesTag({ status }: { status: MeetingNotesStatusValue }) {
  const tag = NOTES[status];
  return tag ? <span className={cn("status-pill", tag.className)}>{tag.label}</span> : null;
}

const meetPath = (id: string) => `/meet/${encodeURIComponent(id)}`;
const meetHref = (id: string) => meetPath(id) as never;

export function LiveBanner({ meetings, now }: { meetings: MeetingSummary[]; now: number }) {
  if (meetings.length === 0) return null;
  return (
    <section aria-label="Live now">
      {/* Same columns as the Upcoming rows: 80px lead column, title block, tags, actions. */}
      <ul className="divide-y divide-[var(--brand-green)]/25 rounded-md border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/10">
        {meetings.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex w-20 shrink-0">
              <span className="status-pill status-pill-sm status-live">Live</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
              <p className="text-xs text-muted-foreground">Started at {pacificTimeLabel(m.startsAt)}</p>
            </div>
            <AccessTag meeting={m} />
            <AgendaButton meeting={m} />
            {m.seriesKey ? null : <CopyLinkButton url={meetingUrl(m.id)} iconOnly />}
            {canJoinNow(m, now) ? (
              <Link href={meetHref(m.id)} className={buttonVariants({ size: "sm" })}>
                Join
              </Link>
            ) : (
              <span className={cn(buttonVariants({ size: "sm", variant: "outline" }), "pointer-events-none opacity-60")} aria-disabled>
                Opens {pacificTimeLabel(new Date(joinOpensAtMs(m)))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpcomingList({
  meetings,
  now,
  onMove,
  onCancel
}: {
  meetings: MeetingSummary[];
  now: number;
  onMove: (m: MeetingSummary) => void;
  onCancel: (m: MeetingSummary) => void;
}) {
  const groups = groupByPacificDay(meetings);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing scheduled in the next three weeks.</p>;
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{group.label}</h3>
          <ul className="divide-y divide-[var(--ink-4)] rounded-md border border-[var(--ink-4)] bg-card">
            {group.items.map((m) => {
              const joinable = canJoinNow(m, now);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-20 shrink-0 font-mono text-sm tabular-nums text-[var(--ink-text)]">{pacificTimeLabel(m.startsAt)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(m.durationMinutes)}
                      {m.createdByName && !m.seriesKey ? ` · ${m.createdByName}` : ""}
                    </p>
                  </div>
                  <AccessTag meeting={m} />
                  <div className="flex gap-2">
                    <AgendaButton meeting={m} />
                    {m.seriesKey ? null : <CopyLinkButton url={meetingUrl(m.id)} iconOnly />}
                    {m.canEdit ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onMove(m)}>
                          Move
                        </Button>
                        <Button size="sm" variant="destructive-quiet" onClick={() => onCancel(m)}>
                          Cancel
                        </Button>
                      </>
                    ) : null}
                    {joinable ? (
                      <Link href={meetHref(m.id)} className={buttonVariants({ size: "sm" })}>
                        Join
                      </Link>
                    ) : (
                      <span
                        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "pointer-events-none opacity-60")}
                        aria-disabled
                      >
                        Opens {pacificTimeLabel(new Date(joinOpensAtMs(m)))}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Past shows the most recent few; older ones open in steps so the tab never becomes one long list. */
const PAST_PREVIEW = 5;
const PAST_STEP = 10;

export function PastList({ meetings }: { meetings: MeetingSummary[] }) {
  const [shown, setShown] = useState(PAST_PREVIEW);
  if (meetings.length === 0) return <p className="text-sm text-muted-foreground">No past meetings yet.</p>;
  const groups = groupByPacificDay(meetings.slice(0, shown), { newestFirst: true });
  const hidden = meetings.length - shown;
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{group.label}</h3>
          <ul className="divide-y divide-[var(--ink-4)] rounded-md border border-[var(--ink-4)] bg-card">
            {group.items.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/meetings/${encodeURIComponent(m.id)}` as never}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none"
                >
                  <span className="w-20 shrink-0 font-mono text-sm tabular-nums text-[var(--ink-text)]">{pacificTimeLabel(m.startsAt)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(m.durationMinutes)} · <span className="font-mono tabular-nums">{m.participantCount}</span> attended
                    </p>
                  </div>
                  <AccessTag meeting={m} />
                  <NotesTag status={m.notesStatus} />
                  <span className="text-sm text-[var(--brand-green)]">Summary</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hidden > 0 || shown > PAST_PREVIEW ? (
        <div className="flex flex-wrap gap-2">
          {hidden > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAST_STEP)}>
              Show older meetings · <span className="font-mono tabular-nums">{hidden}</span> more
            </Button>
          ) : null}
          {shown > PAST_PREVIEW ? (
            <Button size="sm" variant="ghost" onClick={() => setShown(PAST_PREVIEW)}>
              Show fewer
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
