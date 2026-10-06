"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { formatDuration, pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { InviteesDialog } from "../invitees-dialog";
import { AccessTag, NotesTag } from "../tab/meeting-rows";
import { MeetingMarkdown } from "./meeting-markdown";

const NOTES_COPY: Record<MeetingDetail["notesStatus"], string> = {
  NONE: "No notes were taken for this meeting.",
  RECORDING: "The Drive is recording this meeting. Notes appear after it ends.",
  PROCESSING: "The Drive is transcribing and summarizing. Check back in a few minutes.",
  READY: "",
  FAILED: "Notes couldn't be made for this meeting."
};

export default function MeetingNotesClient({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [editInvitees, setEditInvitees] = useState(false);

  const load = useCallback(async () => {
    try {
      setMeeting((await meetingsApi.get(meetingId)).meeting);
    } catch (err) {
      setLoadError(errorMessage(err, "Couldn't load this meeting."));
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function showTranscript() {
    setLoadingTranscript(true);
    try {
      setTranscript((await meetingsApi.transcript(meetingId)).markdown);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the transcript from the Drive."));
    } finally {
      setLoadingTranscript(false);
    }
  }

  return (
    <div className="route-enter mx-auto w-full max-w-[45rem] space-y-6 pb-24">
      <Link href={"/meetings" as never} className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-green)] hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Meetings
      </Link>

      {loadError ? <p className="text-sm text-danger" role="alert">{loadError}</p> : null}
      {!meeting && !loadError ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /> : null}

      {meeting ? (
        <>
          <header className="space-y-2">
            <div className="eyebrow">Meeting notes</div>
            <h1 className="display-md text-foreground">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground">
              {pacificDayLabel(meeting.startsAt)} · {pacificTimeLabel(meeting.startsAt)} · {formatDuration(meeting.durationMinutes)} ·{" "}
              <span className="font-mono tabular-nums">{meeting.participantCount}</span> attended
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <AccessTag meeting={meeting} />
              <NotesTag status={meeting.notesStatus} />
              {meeting.isHost && meeting.canEdit ? (
                <Button size="sm" variant="outline" onClick={() => setEditInvitees(true)}>
                  Edit invited people
                </Button>
              ) : null}
              {meeting.status === "LIVE" ? (
                <Link href={`/meet/${encodeURIComponent(meeting.id)}` as never} className={buttonVariants({ size: "sm" })}>
                  Join
                </Link>
              ) : null}
            </div>
            {meeting.invitees.length > 0 ? (
              <p className="text-xs text-muted-foreground">Invited: {meeting.invitees.map((p) => p.name).join(", ")}</p>
            ) : null}
          </header>

          <section aria-labelledby="summary-heading" className="space-y-3 rounded-md border border-[var(--ink-4)] bg-card p-4 md:p-6">
            <h2 id="summary-heading" className="text-lg font-semibold text-foreground">Summary</h2>
            {meeting.notesSummary ? (
              <MeetingMarkdown markdown={meeting.notesSummary} />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{NOTES_COPY[meeting.notesStatus] || "No summary yet."}</p>
                {meeting.notesError ? <p className="text-sm text-muted-foreground">Reason: {meeting.notesError}</p> : null}
              </>
            )}
          </section>

          {meeting.hasTranscript ? (
            <section aria-labelledby="transcript-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 id="transcript-heading" className="text-lg font-semibold text-foreground">Transcript</h2>
                {transcript === null ? (
                  <Button size="sm" variant="outline" onClick={() => void showTranscript()} disabled={loadingTranscript}>
                    {loadingTranscript ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    Load transcript
                  </Button>
                ) : null}
              </div>
              {transcript !== null ? (
                <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--ink-4)] bg-card p-4 font-sans text-sm leading-relaxed text-[var(--ink-text)]">
                  {transcript}
                </pre>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Stored on the InFocus Drive. Loaded only when you ask.
                </p>
              )}
            </section>
          ) : null}

          <InviteesDialog
            open={editInvitees}
            onOpenChange={setEditInvitees}
            meetingId={meeting.id}
            access={meeting.access}
            onSaved={() => void load()}
          />
        </>
      ) : null}
    </div>
  );
}
