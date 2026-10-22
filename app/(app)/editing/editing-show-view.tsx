"use client";

import { useState } from "react";
import { Loader2, Play, Wand2 } from "lucide-react";
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
import { DetectedStructure, FixConversation, FlaggedDecisions, RedoForm, structureDecisions } from "./show-edit-parts";
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
  if (job?.status === "CANCELLED") return <p className="text-sm text-muted-foreground">The last automatic edit was cancelled. Start it again below.</p>;
  if (job?.status === "REVIEW") return <p className="text-sm text-muted-foreground">The edit is done. Watch it below, then review and schedule it.</p>;
  return <p className="text-sm text-muted-foreground">No automatic edit for this show yet. Pick its recordings below and start one.</p>;
}

/** Recordings, the auto-start note and Start, while the show can (still) be edited. */
function StartCard({ showDate, state, busy, starting, send }: {
  showDate: string; state: ShowEditState; busy: boolean; starting: boolean; send: Send;
}) {
  const [picked, setPicked] = useState<{ date: string; sources: ShowEditSource[] } | null>(null);
  const selected = picked?.date === showDate ? picked.sources : defaultSourceSelection(state.recordings, showDate);
  const selectionError = sourceSelectionError(selected);
  return (
    <Panel title="Start an edit" description="Recordings from the Shows folder on Drive, newest first." bodyClassName="space-y-3">
      {state.recordingsError ? <Alert tone="danger" compact>{state.recordingsError}</Alert> : null}
      {state.settings.autoStart ? <AutoStartNote preview={state.autoStart} /> : null}
      <RecordingPicker
        recordings={state.recordings}
        selected={selected}
        disabled={busy}
        onChange={(sources) => setPicked({ date: showDate, sources })}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy || selectionError !== null}
          onClick={() => void send({ action: "start", date: showDate, sources: selected }, "Automatic editing queued.")}
        >
          {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
          Start automatic editing
        </Button>
        {!state.worker.online ? <InlineNote>{OFFLINE_NOTE}</InlineNote> : null}
      </div>
    </Panel>
  );
}

/** At Review: the edited show, anything flagged, Review & schedule; then the editor's findings, fixes and Redo. */
function ReviewCards({ state, job, sentToYouTube, busy, send, onReview }: {
  state: ShowEditState; job: ShowEditView; sentToYouTube: boolean; busy: boolean; send: Send; onReview: (edited: EditedShow) => void;
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
          <video
            key={state.preview.videoUrl}
            src={state.preview.videoUrl}
            poster={state.preview.posterUrl ?? undefined}
            controls
            preload="metadata"
            className="aspect-video w-full max-w-3xl rounded-md border border-border bg-black"
            aria-label={`Edited show, version ${job.version}`}
          />
        ) : null}
        <FlaggedDecisions decisions={job.decisions} failures={failuresOf(job)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!state.preview || sentToYouTube} onClick={() => state.preview && onReview(state.preview)}>
            <Play aria-hidden />
            Review &amp; schedule
          </Button>
          {job.costUsd !== null ? (
            <span className="text-[13px] text-muted-foreground">Editing cost so far ${job.costUsd.toFixed(2)}</span>
          ) : null}
        </div>
      </Panel>
      {found ? (
        <Panel title="What the editor found">
          <DetectedStructure decisions={job.decisions} />
        </Panel>
      ) : null}
      {!sentToYouTube ? (
        <div className="grid gap-5 @3xl:grid-cols-2">
          <Panel title="Fixes" description="The editor changes this edit and replies with what it did.">
            <FixConversation
              conversation={job.conversation}
              busy={busy}
              onFix={(text, remember) => send({ action: "fix", id: job.id, text, remember }, "Fix sent to the editor.")}
            />
          </Panel>
          <Panel title="Start over" description="Throw this edit away and edit the show again.">
            <RedoForm busy={busy} onRedo={(note) => send({ action: "redo", id: job.id, note }, "Starting the edit over.")} />
          </Panel>
        </div>
      ) : null}
    </>
  );
}

/** The Show view: one show's automatic edit, from Start to Review & schedule. */
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
  return (
    <div className="space-y-5">
      <Panel title="This show's edit" status={<StatusTag tone={summary.tone}>{summary.label}</StatusTag>} bodyClassName="space-y-3">
        <StatusBody state={state} sentToYouTube={sentToYouTube} busy={busy} send={send} />
        {job?.status === "FAILED" && !sentToYouTube ? (
          <RedoForm busy={busy} onRedo={(note) => send({ action: "redo", id: job.id, note }, "Starting the edit over.")} />
        ) : null}
      </Panel>
      {job?.status === "REVIEW" ? (
        <ReviewCards state={state} job={job} sentToYouTube={sentToYouTube} busy={busy} send={send} onReview={onReview} />
      ) : null}
      {canStart ? <StartCard showDate={showDate} state={state} busy={busy} starting={busyAction === "start"} send={send} /> : null}
    </div>
  );
}
