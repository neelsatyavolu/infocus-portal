"use client";

import { memo } from "react";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { formatDuration, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { MeetingRowActions } from "./meeting-row-actions";
import { MEETING_ROW_GRID, RowLead, RowTitle, durationAndCreator } from "./meeting-row-parts";
import { LiveTag } from "./meeting-rows";

/**
 * "Join now": every meeting you can join right now, at the top in every layout. Live meetings,
 * plus scheduled ones inside their 5-minute early window ("Starting"). Rows use the Upcoming
 * grid: the tag over the mono start time, then the title, then the actions. The first Join is
 * the page's one primary.
 */
export const NowPanel = memo(function NowPanel({
  meetings,
  showMenuSlot,
  agendaCounts,
  onAgenda,
  onMove,
  onCancel
}: {
  meetings: MeetingSummary[];
  /** Reserve the ⋯ column; decided once for Now and Upcoming together so their columns line up. */
  showMenuSlot: boolean;
  /** Agenda counts the tab's sheet loaded, by meeting id; newer than the list's agendaCount. */
  agendaCounts: Readonly<Record<string, number>>;
  onAgenda: (meeting: MeetingSummary) => void;
  onMove: (meeting: MeetingSummary) => void;
  onCancel: (meeting: MeetingSummary) => void;
}) {
  if (meetings.length === 0) return null;
  return (
    <Panel
      id="meetings-now"
      title="Join now"
      titleAs="h2"
      count={meetings.length}
      padding="none"
      tone="brand"
      className="bg-[var(--brand-green)]/[0.06]"
    >
      <ul className="divide-y divide-border">
        {meetings.map((meeting, index) => {
          const live = meeting.status === "LIVE";
          return (
            <li key={meeting.id} className={MEETING_ROW_GRID}>
              <RowLead
                label={live ? <LiveTag /> : <StatusTag tone="success">Starting</StatusTag>}
                time={pacificTimeLabel(meeting.startsAt)}
              />
              <RowTitle
                meeting={meeting}
                meta={durationAndCreator(meeting, formatDuration(meeting.durationMinutes))}
              />
              <MeetingRowActions
                meeting={meeting}
                joinable
                primary={index === 0}
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
    </Panel>
  );
});
