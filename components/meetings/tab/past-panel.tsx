"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { cn } from "@/src/lib/utils";
import { formatDuration, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { HEADER_HIDDEN_WHEN_STACKED } from "./board-columns";
import { pastDayLabel } from "./day-label";
import { PAST_ROW_GRID, ROW_CONTROL, ROW_INSET, RowLead } from "./meeting-row-parts";
import { AccessTag, NotesTag } from "./meeting-rows";

/** Past shows the most recent few; older ones open in steps so the panel never becomes one long list. */
const PAST_PREVIEW = 5;
const PAST_STEP = 10;

/**
 * Recent meetings, newest first; each row leads with its day and time and opens its notes.
 * Lines: title and chevron, then duration and attendance, then the notes and access tags when
 * there are any.
 */
export const PastPanel = memo(function PastPanel({ meetings, todayKey }: { meetings: MeetingSummary[]; todayKey: string }) {
  const [shown, setShown] = useState(PAST_PREVIEW);
  const hidden = Math.max(0, meetings.length - shown);
  const paging = hidden > 0 || shown > PAST_PREVIEW;

  return (
    <Panel
      id="meetings-past"
      title="Past"
      titleAs="h2"
      count={meetings.length}
      padding="none"
      className={HEADER_HIDDEN_WHEN_STACKED}
      footer={
        paging ? (
          <>
            {hidden > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAST_STEP)} className={ROW_CONTROL}>
                Show older · <span className="font-mono tabular-nums">{hidden}</span>
              </Button>
            ) : null}
            {shown > PAST_PREVIEW ? (
              <Button size="sm" variant="ghost" onClick={() => setShown(PAST_PREVIEW)} className={ROW_CONTROL}>
                Show fewer
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {meetings.length === 0 ? (
        <EmptyState size="inline" title="No past meetings yet." className={ROW_INSET} />
      ) : (
        // The list is the container the rows' columns follow (PAST_ROW_GRID).
        <ul className="@container divide-y divide-border">
          {meetings.slice(0, shown).map((meeting) => {
            const tagged = meeting.notesStatus !== "NONE" || meeting.access !== "OPEN";
            return (
              <li key={meeting.id}>
                <Link
                  href={`/meetings/${encodeURIComponent(meeting.id)}` as never}
                  className={cn(
                    PAST_ROW_GRID,
                    "transition-colors hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <RowLead
                    label={pastDayLabel(meeting.startsAt, todayKey)}
                    time={pacificTimeLabel(meeting.startsAt)}
                    layout="container"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      <span className="sr-only">Notes for </span>
                      {meeting.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatDuration(meeting.durationMinutes)} · <span className="font-mono tabular-nums">{meeting.participantCount}</span> attended
                    </p>
                    {tagged ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <NotesTag status={meeting.notesStatus} size="sm" />
                        <AccessTag meeting={meeting} size="sm" />
                      </div>
                    ) : null}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
});
