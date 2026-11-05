"use client";

import { memo } from "react";
import { CalendarX } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { formatDuration, joinOpensAtMs, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { HEADER_HIDDEN_WHEN_STACKED } from "./board-columns";
import { upcomingDayLabel } from "./day-label";
import { MeetingRowActions } from "./meeting-row-actions";
import { MEETING_ROW_GRID, ROW_INSET, RowLead, RowTitle, durationAndCreator } from "./meeting-row-parts";

/**
 * The next three weeks in one card, oldest first. Each row leads with its day ("Today",
 * "Tomorrow", "Wed 15") and time, so there are no separate day headers. Every row says when it
 * opens to join. Meetings already open to join are in the Join now panel instead, so when those
 * are all there is, the empty line says "Nothing else".
 */
export const UpcomingPanel = memo(function UpcomingPanel({
  meetings,
  startingCount,
  todayKey,
  showMenuSlot,
  agendaCounts,
  onAgenda,
  onMove,
  onCancel
}: {
  /** Sorted oldest first, without the ones in the Now panel. */
  meetings: MeetingSummary[];
  /** Scheduled meetings already open to join, listed in the Join now panel above. */
  startingCount: number;
  /** Pacific day key for today ("2026-10-15"); changes at midnight, so rows only re-render then. */
  todayKey: string;
  /** Reserve the ⋯ column; decided once for Now and Upcoming together so their columns line up. */
  showMenuSlot: boolean;
  /** Agenda counts the tab's sheet loaded, by meeting id; newer than the list's agendaCount. */
  agendaCounts: Readonly<Record<string, number>>;
  onAgenda: (meeting: MeetingSummary) => void;
  onMove: (meeting: MeetingSummary) => void;
  onCancel: (meeting: MeetingSummary) => void;
}) {
  return (
    <Panel
      id="meetings-upcoming"
      title="Upcoming"
      titleAs="h2"
      count={meetings.length}
      description="Next 3 weeks"
      padding="none"
      className={HEADER_HIDDEN_WHEN_STACKED}
    >
      {meetings.length === 0 ? (
        <EmptyState
          size="inline"
          icon={CalendarX}
          title={
            startingCount > 0
              ? "Nothing else scheduled in the next three weeks."
              : "Nothing scheduled in the next three weeks."
          }
          className={ROW_INSET}
        />
      ) : (
        <ul className="divide-y divide-border">
          {meetings.map((meeting) => {
            const opensAt = pacificTimeLabel(new Date(joinOpensAtMs(meeting)));
            return (
              <li key={meeting.id} className={MEETING_ROW_GRID}>
                <RowLead
                  label={upcomingDayLabel(meeting.startsAt, todayKey)}
                  time={pacificTimeLabel(meeting.startsAt)}
                  phoneAside={
                    <>
                      Opens <span className="font-mono tabular-nums">{opensAt}</span>
                    </>
                  }
                />
                <RowTitle meeting={meeting} meta={durationAndCreator(meeting, formatDuration(meeting.durationMinutes))} />
                <MeetingRowActions
                  meeting={meeting}
                  joinable={false}
                  opensAt={opensAt}
                  showMenuSlot={showMenuSlot}
                  agendaCount={agendaCounts[meeting.id] ?? meeting.agendaCount}
                  onAgenda={onAgenda}
                  onMove={onMove}
                  onCancel={onCancel}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
});
