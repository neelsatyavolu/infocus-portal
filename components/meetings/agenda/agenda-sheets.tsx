"use client";

import { useEffect, useState } from "react";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { agendaProgress } from "@/src/lib/meetings/agenda";
import { meetingsApi } from "@/src/lib/meetings/client/api";
import { AGENDA_QUERY_PARAM } from "./agenda-button";
import { AgendaSheet } from "./agenda-sheet";
import { useAgenda } from "./use-agenda";

// The Meetings tab loads these with next/dynamic: the editor (and its drag-and-drop library)
// downloads only when an agenda opens, not with every row's Agenda button.

/**
 * The agenda sheet for one meeting on the Meetings tab. Mount it once, keyed by the meeting id,
 * outside the rows. Any producer who can see the meeting can edit; over meetings are read-only.
 * It loads only while open, and reports the live item count (`onCount`) so the row's button
 * keeps up with edits.
 */
export function MeetingAgendaSheet({
  meeting,
  open,
  onOpenChange,
  onCount
}: {
  meeting: Pick<MeetingSummary, "id" | "title" | "startsAt">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCount: (meetingId: string, count: number) => void;
}) {
  const agenda = useAgenda(meeting.id, open);
  const count = agenda.items ? agendaProgress(agenda.items).total : null;

  useEffect(() => {
    if (count !== null) onCount(meeting.id, count);
  }, [count, meeting.id, onCount]);

  return (
    <AgendaSheet
      open={open}
      onOpenChange={onOpenChange}
      meetingId={meeting.id}
      title={meeting.title}
      startsAt={meeting.startsAt}
      agenda={agenda}
    />
  );
}

/** Mount once on the Meetings tab: opens the editor named by `?agenda=<meetingId>`. */
export function AgendaFromQuery() {
  // Client-only (the Meetings tab loads this with ssr: false), so the first render can read the URL.
  const [wanted] = useState(() => new URLSearchParams(window.location.search).get(AGENDA_QUERY_PARAM));
  const [meetingId, setMeetingId] = useState(wanted ?? "");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState<string | undefined>(undefined);
  const agenda = useAgenda(meetingId, Boolean(meetingId));

  useEffect(() => {
    if (!wanted) return;
    meetingsApi
      .get(wanted)
      .then(({ meeting }) => {
        setTitle(meeting.title);
        setStartsAt(meeting.startsAt);
      })
      .catch(() => setTitle(""));
  }, [wanted]);

  const close = () => {
    setMeetingId("");
    const url = new URL(window.location.href);
    url.searchParams.delete(AGENDA_QUERY_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  return (
    <AgendaSheet
      open={Boolean(meetingId)}
      onOpenChange={(open) => !open && close()}
      meetingId={meetingId}
      title={title}
      startsAt={startsAt}
      agenda={agenda}
    />
  );
}
