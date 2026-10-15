"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert, InlineNote } from "@/components/kit/alert";
import { BackLink } from "@/components/kit/button-group";
import { Panel } from "@/components/kit/panel";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { formatDuration, pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { InviteesDialog } from "../invitees-dialog";
import { BoardColumns } from "../tab/board-columns";
import { AccessTag, LiveTag, NotesTag } from "../tab/meeting-rows";
import { MeetingDetailsPanel, MeetingInvitedPanel } from "./meeting-details-panel";
import { MeetingMarkdown } from "./meeting-markdown";
import { NotesSkeleton } from "./notes-skeleton";

const NOTES_COPY: Record<MeetingDetail["notesStatus"], string> = {
  NONE: "No notes were taken for this meeting.",
  RECORDING: "The Drive is recording this meeting. Notes appear after it ends.",
  PROCESSING: "The Drive is transcribing and summarizing. Check back in a few minutes.",
  READY: "",
  FAILED: "Notes couldn't be made for this meeting."
};

const cacheKey = (id: string) => `meetings:detail:${id}`;

/** The summary, or why there isn't one (a failure is an Alert with its reason). */
function SummaryBody({ meeting }: { meeting: MeetingDetail }) {
  if (meeting.notesSummary) {
    // The reading column itself is the line length (BoardColumns "reading").
    return <MeetingMarkdown markdown={meeting.notesSummary} />;
  }
  const copy = NOTES_COPY[meeting.notesStatus] || "No summary yet.";
  const reason = meeting.notesError ? <p className="mt-1">Reason: {meeting.notesError}</p> : null;
  if (meeting.notesStatus === "FAILED") {
    return (
      <Alert tone="danger" compact>
        {copy}
        {reason}
      </Alert>
    );
  }
  return (
    <div className="text-sm text-muted-foreground">
      <p>{copy}</p>
      {reason}
    </div>
  );
}

export default function MeetingNotesClient({ meetingId }: { meetingId: string }) {
  // In-memory cache (empty on a full page load), so this never differs from the server render.
  const [meeting, setMeeting] = useState<MeetingDetail | null>(() => cachedValue<MeetingDetail>(cacheKey(meetingId)) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [editInvitees, setEditInvitees] = useState(false);

  const load = useCallback(
    () =>
      meetingsApi
        .get(meetingId)
        .then(({ meeting: next }) => {
          rememberValue(cacheKey(meetingId), next);
          setMeeting(next);
          setLoadError(null);
        })
        .catch((err: unknown) => {
          setLoadError(errorMessage(err, "Couldn't load this meeting."));
        }),
    [meetingId]
  );

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

  const canEditInvitees = Boolean(meeting?.isHost && meeting.canEdit);

  return (
    <div className="route-enter space-y-5">
      {/* Block-level and closer to the plate than the page rhythm: it belongs to the header. */}
      <BackLink href="/meetings" className="mb-2 flex w-fit">
        Meetings
      </BackLink>

      {meeting ? (
        <PageHeader
          eyebrow="Meeting notes"
          status={
            <>
              {meeting.status === "LIVE" ? <LiveTag /> : null}
              <AccessTag meeting={meeting} />
              <NotesTag status={meeting.notesStatus} />
            </>
          }
          title={meeting.title}
          description={
            <>
              {pacificDayLabel(meeting.startsAt)} · {pacificTimeLabel(meeting.startsAt)} Pacific · {formatDuration(meeting.durationMinutes)} ·{" "}
              <span className="font-mono tabular-nums">{meeting.participantCount}</span> attended
            </>
          }
          actions={
            canEditInvitees || meeting.status === "LIVE" ? (
              <>
                {canEditInvitees ? (
                  <Button variant="outline" onClick={() => setEditInvitees(true)} className="max-md:h-10!">
                    Edit invited people
                  </Button>
                ) : null}
                {meeting.status === "LIVE" ? (
                  <Link
                    href={`/meet/${encodeURIComponent(meeting.id)}` as never}
                    aria-label={`Join ${meeting.title}`}
                    className={cn(buttonVariants(), "max-md:h-10!")}
                  >
                    Join
                  </Link>
                ) : null}
              </>
            ) : null
          }
        />
      ) : null}

      {loadError ? (
        <Alert
          tone="danger"
          action={
            <Button size="sm" variant="outline" onClick={() => void load()} className="max-md:h-10!">
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}
      {!meeting && !loadError ? <NotesSkeleton /> : null}

      {meeting ? (
        <>
          <BoardColumns
            variant="reading"
            main={
              <>
                <Panel id="meeting-summary" title="Summary" titleAs="h2">
                  <SummaryBody meeting={meeting} />
                </Panel>
                {meeting.hasTranscript ? (
                  <Panel
                    id="meeting-transcript"
                    title="Transcript"
                    titleAs="h2"
                    padding="none"
                    actions={
                      transcript === null ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void showTranscript()}
                          disabled={loadingTranscript}
                          className="max-md:h-10!"
                        >
                          {loadingTranscript ? <Loader2 className="animate-spin" aria-hidden /> : null}
                          Load transcript
                        </Button>
                      ) : null
                    }
                  >
                    {transcript !== null ? (
                      // Flush in the card (no box in a box); it scrolls inside its own height.
                      <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-sans text-sm leading-relaxed text-[var(--ink-text)] md:px-5">
                        {transcript}
                      </pre>
                    ) : (
                      <InlineNote icon={Lock} className="px-4 py-3 md:px-5">
                        Stored on the InFocus Drive. Loaded only when you ask.
                      </InlineNote>
                    )}
                  </Panel>
                ) : null}
              </>
            }
            rail={
              <>
                <MeetingDetailsPanel meeting={meeting} />
                <MeetingInvitedPanel meeting={meeting} canEdit={canEditInvitees} />
              </>
            }
          />

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
