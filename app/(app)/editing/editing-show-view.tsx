"use client";

import { useState } from "react";
import { CalendarCheck, Loader2, Undo2, Wand2 } from "lucide-react";
import { Alert, InlineNote } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { SHOW_EDIT_STAGE_LABELS, type ShowEditState, type ShowEditView } from "@/src/lib/show-editor";
import {
  defaultSourceSelection, SHOW_EDIT_SOURCE_ROLE_LABELS, sourceSelectionError, type ShowEditSource
} from "@/src/lib/show-editor-sources";
import { editSummaryStatus } from "@/src/lib/show-editor-views";
import type { EditedShow } from "../show-roles/show-upload-dialog";
import {
  approveLine, AUTO_SCHEDULE_NOTE, DebugLogLinks, DetectedStructure, FixHistory, FlaggedDecisions, RedoControl, SendBackForm, structureDecisions
} from "./show-edit-parts";
import { EditedShowVideo } from "./edited-show-video";
import { RecordingPicker } from "./show-edit-recordings";
import { isActiveJob, type EditAction } from "./use-show-edit";

const OFFLINE_NOTE = "The editing machine is offline. The job will start when it's back.";

const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

type Send = (body: EditAction, success?: string) => Promise<boolean>;

/** With auto-start on: which recordings it will start this show from, and whether it's still waiting for them. */
function AutoStartNote({ preview }: { preview: ShowEditState["autoStart"] }) {
  if (!preview) {
    return <InlineNote>Auto-start is on. It starts this show once its recordings reach the Shows folder and stop changing for 10 minutes.</InlineNote>;
  }
  const files = preview.files.map((file) => `${file.path.split("/").pop()} (${SHOW_EDIT_SOURCE_ROLE_LABELS[file.role]})`).join(", ");
  if (preview.error) return <InlineNote tone="warning">Auto-start found {files}, but can&rsquo;t use them: {preview.error} Pick the recordings below instead.</InlineNote>;
  return (
    <InlineNote>
      Auto-start will edit this show from {files}
      {preview.ready || !preview.readyAt
        ? "; it starts within 5 minutes."
        : ` once its files have settled (about ${clock.format(new Date(preview.readyAt))}).`}
    </InlineNote>
  );
}

function failuresOf(job: ShowEditView) {
  const failures = job.checks?.failures;
  return Array.isArray(failures) ? (failures as { rule?: string; detail?: string }[]) : [];
}

function progressLine(job: ShowEditView, waitingFor: string | null) {
  if (job.status === "QUEUED") {
    if (job.pendingFix) return waitingFor ? `Waiting for ${waitingFor} to come online (fix, v${job.version + 1})` : `Fix waiting for the editing machine (v${job.version + 1})`;
    return job.message ?? "Waiting for the editing machine";
  }
  const stage = job.stage ? SHOW_EDIT_STAGE_LABELS[job.stage] : "Starting";
  const prefix = job.pendingFix ? `Fixing (v${job.version + 1}) · ` : "";
  return `${prefix}${stage}${job.message ? `: ${job.message}` : ""}`;
}

/** The status card's body: the live stage and Cancel, the failure, or where the show stands. */
function StatusBody({ state, sentToYouTube, busy, send }: { state: ShowEditState; sentToYouTube: boolean; busy: boolean; send: Send }) {
  const { job, worker } = state;
  if (job && isActiveJob(job)) {
    return (
      <div className="space-y-3">
        <p aria-live="polite" className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          {progressLine(job, state.waitingFor)}
        </p>
        {!worker.online ? <InlineNote>{OFFLINE_NOTE}</InlineNote> : null}
        <Button
          type="button"
          variant="destructive-quiet"
          disabled={busy || job.cancelRequested}
          onClick={() => void send({ action: "cancel", id: job.id })}
        >
          {job.cancelRequested ? "Cancelling…" : job.pendingFix ? "Cancel the fix" : "Cancel"}
        </Button>
      </div>
    );
  }
  if (job?.status === "FAILED") return <Alert tone="danger" title="The automatic edit failed" compact>{job.error ?? "Unknown error."}</Alert>;
  if (job?.status === "PUBLISHED" || sentToYouTube) {
    return <p className="text-sm text-muted-foreground">This show was sent to YouTube. Make changes in YouTube Studio.</p>;
  }
  if (job?.status === "CANCELLED") return <p className="text-sm text-muted-foreground">The last automatic edit was cancelled. You can start it again.</p>;
  if (job?.status === "REVIEW") return <p className="text-sm text-muted-foreground">The edit is done. Watch it below, then approve it or send it back.</p>;
  return <p className="text-sm text-muted-foreground">No automatic edit for this show yet.</p>;
}

function fileNameOf(path: string) {
  return path.split("/").pop() ?? path;
}

/** Start, at the top of the status card: what it will use, the button, and the offline note. */
function StartRow({ selected, selectionError, busy, starting, online, onStart }: {
  selected: ShowEditSource[]; selectionError: string | null; busy: boolean; starting: boolean; online: boolean; onStart: () => void;
}) {
  const used = selected.filter((source) => source.role !== "ignore");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || selectionError !== null} onClick={onStart}>
          {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
          Start automatic editing
        </Button>
        <span className="text-[13px] text-muted-foreground">
          {selectionError ?? `Uses ${used.length === 1 ? "1 recording" : `${used.length} recordings`}: ${used.map((source) => fileNameOf(source.path)).join(", ")}. Change them under Recordings.`}
        </span>
      </div>
      {!online ? <InlineNote>{OFFLINE_NOTE}</InlineNote> : null}
    </div>
  );
}

/** The recordings to edit and the auto-start note, while the show can (still) be edited. */
function RecordingsCard({ state, selected, busy, onChange }: {
  state: ShowEditState; selected: ShowEditSource[]; busy: boolean; onChange: (sources: ShowEditSource[]) => void;
}) {
  return (
    <Panel
      title="Recordings"
      description="From the Shows folder on Drive, newest first. This show's recordings are ticked already."
      bodyClassName="space-y-3"
    >
      {state.recordingsError ? <Alert tone="danger" compact>{state.recordingsError}</Alert> : null}
      {state.settings.autoStart ? <AutoStartNote preview={state.autoStart} /> : null}
      <RecordingPicker recordings={state.recordings} selected={selected} disabled={busy} onChange={onChange} />
    </Panel>
  );
}

/** Approve & schedule with what it will do, Change details (the upload dialog), and Send back with its form. */
function ReviewActions({ state, job, sentToYouTube, busyAction, send, onReview }: {
  state: ShowEditState; job: ShowEditView; sentToYouTube: boolean; busyAction: EditAction["action"] | null; send: Send;
  onReview: (edited: EditedShow) => void;
}) {
  const [sendingBack, setSendingBack] = useState(false);
  const busy = busyAction !== null;
  const { approve, preview } = state;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          disabled={busy || !approve || approve.problem !== null || sentToYouTube}
          onClick={() => void send({ action: "approve", id: job.id }, "Approved. Scheduled on YouTube.")}
        >
          {busyAction === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarCheck aria-hidden />}
          Approve &amp; schedule
        </Button>
        <span className="text-[13px] text-muted-foreground">{approveLine(approve)}</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          disabled={!preview || sentToYouTube}
          onClick={() => preview && onReview(preview)}
        >
          Change details
        </Button>
      </div>
      {!sentToYouTube ? <p className="text-[13px] text-muted-foreground">{AUTO_SCHEDULE_NOTE}</p> : null}
      {!sentToYouTube ? (
        <>
          <Button type="button" variant="outline" disabled={busy} aria-expanded={sendingBack} onClick={() => setSendingBack((open) => !open)}>
            <Undo2 aria-hidden />
            Send back
          </Button>
          {sendingBack ? (
            <SendBackForm
              busy={busy}
              onSendBack={async (text, remember) => {
                const done = await send({ action: "fix", id: job.id, text, remember }, "Sent back. The editor will make a new version.");
                if (done) setSendingBack(false);
                return done;
              }}
            />
          ) : null}
        </>
      ) : null}
      <FixHistory conversation={job.conversation} />
    </div>
  );
}

/** At Review: the edited show, anything flagged, Approve or Send back; then what the editor found. */
function ReviewCards({ state, job, sentToYouTube, busyAction, send, onReview }: {
  state: ShowEditState; job: ShowEditView; sentToYouTube: boolean; busyAction: EditAction["action"] | null; send: Send;
  onReview: (edited: EditedShow) => void;
}) {
  const found = structureDecisions(job.decisions).length > 0;
  return (
    <>
      <Panel
        title="Review"
        status={<StatusTag tone="neutral">Version {job.version}</StatusTag>}
        bodyClassName="space-y-4"
      >
        {job.error ? <Alert tone="danger" compact>{job.error}</Alert> : null}
        {state.preview ? (
          <EditedShowVideo
            key={`${job.id}-${job.version}`}
            videoUrl={state.preview.videoUrl}
            posterUrl={state.preview.posterUrl}
            label={`Edited show, version ${job.version}`}
          />
        ) : null}
        <FlaggedDecisions decisions={job.decisions} failures={failuresOf(job)} />
        <ReviewActions state={state} job={job} sentToYouTube={sentToYouTube} busyAction={busyAction} send={send} onReview={onReview} />
        {job.costUsd !== null ? (
          <p className="text-[13px] text-muted-foreground">Editing cost so far ${job.costUsd.toFixed(2)}</p>
        ) : null}
      </Panel>
      {found ? (
        <Panel title="What the editor found">
          <DetectedStructure decisions={job.decisions} />
        </Panel>
      ) : null}
    </>
  );
}

/** The Show view: one show's automatic edit, from Start to Approve & schedule. */
export function EditingShowView({ showDate, state, busyAction, send, onReview }: {
  showDate: string;
  state: ShowEditState;
  busyAction: EditAction["action"] | null;
  send: Send;
  onReview: (edited: EditedShow) => void;
}) {
  const { job } = state;
  const busy = busyAction !== null;
  const sentToYouTube = state.publicationStatus !== null && state.publicationStatus !== "DRAFT";
  const canStart = !sentToYouTube && (!job || ["FAILED", "CANCELLED"].includes(job.status));
  const summary = editSummaryStatus({ status: job?.status ?? null, stage: job?.stage ?? null, publicationStatus: state.publicationStatus });
  // The recordings picked for this date (cleared when the date changes); Start sits at the top.
  const [picked, setPicked] = useState<{ date: string; sources: ShowEditSource[] } | null>(null);
  const selected = picked?.date === showDate ? picked.sources : defaultSourceSelection(state.recordings, showDate);
  return (
    <div className="space-y-5">
      <Panel title="This show's edit" status={<StatusTag tone={summary.tone}>{summary.label}</StatusTag>} bodyClassName="space-y-3">
        <StatusBody state={state} sentToYouTube={sentToYouTube} busy={busy} send={send} />
        {job && !isActiveJob(job) ? <DebugLogLinks logs={job.debugLogs} /> : null}
        {canStart ? (
          <StartRow
            selected={selected}
            selectionError={sourceSelectionError(selected)}
            busy={busy}
            starting={busyAction === "start"}
            online={state.worker.online}
            onStart={() => void send({ action: "start", date: showDate, sources: selected }, "Automatic editing queued.")}
          />
        ) : null}
        {(job?.status === "FAILED" || job?.status === "REVIEW") && !sentToYouTube ? (
          <RedoControl busy={busy} onRedo={(note) => send({ action: "redo", id: job.id, ...(note ? { note } : {}) }, "Starting the edit over.")} />
        ) : null}
      </Panel>
      {job?.status === "REVIEW" ? (
        <ReviewCards state={state} job={job} sentToYouTube={sentToYouTube} busyAction={busyAction} send={send} onReview={onReview} />
      ) : null}
      {canStart ? (
        <RecordingsCard state={state} selected={selected} busy={busy} onChange={(sources) => setPicked({ date: showDate, sources })} />
      ) : null}
    </div>
  );
}
