"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { agendaProgress } from "@/src/lib/meetings/agenda";
import { meetingsApi } from "@/src/lib/meetings/client/api";
import { pointerSafeAutoFocus } from "../focus-modality";
import { AgendaEditor } from "./agenda-editor";
import { useAgenda } from "./use-agenda";

/** `/meetings?agenda=<meetingId>` opens that meeting's editor (the in-call "Edit agenda" link). */
export const AGENDA_QUERY_PARAM = "agenda";

export function agendaEditorHref(meetingId: string) {
  return `/meetings?${AGENDA_QUERY_PARAM}=${encodeURIComponent(meetingId)}`;
}

function AgendaDialog({
  open,
  onOpenChange,
  meetingId,
  title,
  agenda
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  title: string;
  agenda: ReturnType<typeof useAgenda>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="max-h-[85dvh] max-w-lg overflow-y-auto outline-none [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Agenda</DialogTitle>
          <DialogDescription>
            {title || "Meeting"}. Any producer can add, edit and reorder items.
          </DialogDescription>
        </DialogHeader>
        {meetingId ? <AgendaEditor agenda={agenda} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Meetings tab: "Agenda n" button + editor dialog for one meeting. Self-contained; drop it into
 * a meeting row. Any producer who can see the meeting can edit; over meetings are read-only.
 */
export function AgendaButton({ meeting }: { meeting: Pick<MeetingSummary, "id" | "title" | "agendaCount"> }) {
  const [open, setOpen] = useState(false);
  // Loads only once opened; the list's agendaCount covers the badge until then.
  const agenda = useAgenda(meeting.id, open);
  const count = agenda.items ? agendaProgress(agenda.items).total : meeting.agendaCount;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Agenda for ${meeting.title}`}>
        <ListChecks aria-hidden />
        Agenda
        {count ? <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span> : null}
      </Button>
      <AgendaDialog open={open} onOpenChange={setOpen} meetingId={meeting.id} title={meeting.title} agenda={agenda} />
    </>
  );
}

/** Mount once on the Meetings tab: opens the editor named by `?agenda=<meetingId>`. */
export function AgendaFromQuery() {
  const [meetingId, setMeetingId] = useState("");
  const [title, setTitle] = useState("");
  const agenda = useAgenda(meetingId, Boolean(meetingId));

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(AGENDA_QUERY_PARAM);
    if (!wanted) return;
    setMeetingId(wanted);
    meetingsApi
      .get(wanted)
      .then(({ meeting }) => setTitle(meeting.title))
      .catch(() => setTitle(""));
  }, []);

  const close = () => {
    setMeetingId("");
    const url = new URL(window.location.href);
    url.searchParams.delete(AGENDA_QUERY_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  return (
    <AgendaDialog open={Boolean(meetingId)} onOpenChange={(open) => !open && close()} meetingId={meetingId} title={title} agenda={agenda} />
  );
}
