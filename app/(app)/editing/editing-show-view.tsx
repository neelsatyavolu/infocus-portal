"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, ExternalLink, Loader2, MessageSquarePlus, Undo2, Wand2 } from "lucide-react";
import { Alert, InlineNote } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  announcementNote, packageNote, SHOW_EDIT_NOTE_MAX, SHOW_EDIT_STAGE_LABELS, type QueuedPackageView, type ShowEditState, type ShowEditView
} from "@/src/lib/show-editor";
import { SHOW_PUBLISH_TIME } from "@/src/lib/show-publication";
import {
  defaultSourceSelection, SHOW_EDIT_SOURCE_ROLE_LABELS, sourceSelectionError, type ShowEditSource
} from "@/src/lib/show-editor-sources";
import { editSummaryStatus } from "@/src/lib/show-editor-views";
import type { EditedShow } from "../show-roles/show-upload-dialog";
import {
  approveLine, AUTO_SCHEDULE_NOTE, DebugLogLinks, DetectedStructure, FixHistory, FlaggedDecisions, LINK_CLASS, pacificTime, RECOMPOSITE_USED, RecompositeCheckbox, RedoControl,
  SendBackForm, sentLine, structureDecisions
} from "./show-edit-parts";
import { chaptersOf } from "@/src/lib/show-chapters";
import { EditedShowVideo } from "./edited-show-video";
import { RecordingPicker } from "./show-edit-recordings";
import { isActiveJob, type EditAction } from "./use-show-edit";

const OFFLINE_NOTE = "The editing machine is offline. The job will start when it's back.";

const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

type Send = (body: EditAction, success?: string) => Promise<boolean>;
type PublishSlot = { date: string; time: string };

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
    const youtubeUrl = state.published?.youtubeUrl;
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{sentLine(state.published)}</p>
        {youtubeUrl ? (
          <a href={youtubeUrl} target="_blank" rel="noreferrer" className={`${LINK_CLASS} text-sm`}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Watch on YouTube
          </a>
        ) : null}
      </div>
    );
  }
  if (job?.status === "CANCELLED") return <p className="text-sm text-muted-foreground">The last automatic edit was cancelled. You can start it again.</p>;
  if (job?.status === "REVIEW") return <p className="text-sm text-muted-foreground">The edit is done. Watch it below, then approve it or send it back.</p>;
  return <p className="text-sm text-muted-foreground">No automatic edit for this show yet.</p>;
}

function fileNameOf(path: string) {
  return path.split("/").pop() ?? path;
}

/** The publish date and time, beside the instructions: the usual 8:30 AM on show day unless changed. */
function PublishTimeFields({ showDate, slot, disabled, onChange }: {
  showDate: string; slot: PublishSlot; disabled: boolean; onChange: (slot: PublishSlot) => void;
}) {
  const usual = slot.date === showDate && slot.time === SHOW_PUBLISH_TIME;
  return (
    <div className="max-w-2xl space-y-1.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1.5">
          <span className="block text-[13px] font-medium">Goes public</span>
          <Input type="date" value={slot.date} disabled={disabled} onChange={(event) => onChange({ ...slot, date: event.target.value })} />
        </label>
        <label className="space-y-1.5">
          <span className="block text-[13px] font-medium">Time (Pacific)</span>
          <Input type="time" value={slot.time} disabled={disabled} onChange={(event) => onChange({ ...slot, time: event.target.value })} />
        </label>
      </div>
      <span className="block text-[12px] text-muted-foreground">
        {usual ? "The usual time. Change it only if this show goes public at another time." : "This show goes public at this time instead of 8:30 AM on show day."}
      </span>
    </div>
  );
}

/** Start, at the top of the status card: what it will use, the button, and the offline note. */
function StartRow({ showDate, selected, selectionError, packages, announcements, busy, starting, online, onStart }: {
  showDate: string; selected: ShowEditSource[]; selectionError: string | null; packages: QueuedPackageView[];
  announcements: number | null; busy: boolean; starting: boolean; online: boolean;
  onStart: (note: string, publish: PublishSlot | null, recomposite: boolean) => void;
}) {
  const packageLine = packageNote(packages);
  const announcementLine = announcementNote(announcements);
  const used = selected.filter((source) => source.role !== "ignore");
  // Optional instructions for this edit; the editor follows them over the house rules.
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [recomposite, setRecomposite] = useState(false);
  const [slot, setSlot] = useState<PublishSlot>({ date: showDate, time: SHOW_PUBLISH_TIME });
  // Only a changed, complete date and time is sent; otherwise the show keeps the usual time.
  const changed = open && slot.date && slot.time && (slot.date !== showDate || slot.time !== SHOW_PUBLISH_TIME) ? slot : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || selectionError !== null} onClick={() => onStart(open ? note.trim() : "", changed, recomposite)}>
          {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
          Start automatic editing
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <MessageSquarePlus aria-hidden />
          {open ? "No instructions" : "Add instructions"}
        </Button>
        <span className="text-[13px] text-muted-foreground">
          {selectionError ?? `Uses ${used.length === 1 ? "1 recording" : `${used.length} recordings`}: ${used.map((source) => fileNameOf(source.path)).join(", ")}. Change them under Recordings.`}
        </span>
      </div>
      {open ? (
        <label className="block max-w-2xl space-y-1.5">
          <span className="text-[13px] font-medium">Instructions for the editor (optional)</span>
          <Textarea
            value={note}
            maxLength={SHOW_EDIT_NOTE_MAX}
            rows={3}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Use the later take of the open, and leave out the yearbook announcement."
          />
          <span className="block text-[12px] text-muted-foreground">
            For this show only. To make something permanent, add it to the house rules in Settings.
          </span>
        </label>
      ) : null}
      {open ? <PublishTimeFields showDate={showDate} slot={slot} disabled={busy} onChange={setSlot} /> : null}
      <RecompositeCheckbox checked={recomposite} disabled={busy} onChange={setRecomposite} />
      <InlineNote tone={announcementLine.tone === "warning" ? "warning" : "muted"}>
        {announcementLine.text}{" "}
        {announcementLine.tone === "warning" ? (
          <Link href={`/teleprompter?showDate=${showDate}` as never} className="underline underline-offset-2">Open the script</Link>
        ) : null}
      </InlineNote>
      <InlineNote tone={packageLine.tone === "warning" ? "warning" : "muted"}>
        {packageLine.text}{" "}
        {packageLine.tone === "warning" ? (
          <Link href="/publishing-queue" className="underline underline-offset-2">Open the Publishing Queue</Link>
        ) : null}
      </InlineNote>
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
function ReviewActions({ state, job, busyAction, send, onReview }: {
  state: ShowEditState; job: ShowEditView; busyAction: EditAction["action"] | null; send: Send; onReview: (edited: EditedShow) => void;
}) {
  const [sendingBack, setSendingBack] = useState(false);
  // The publish time the producer ticked as right; a different time (after Change details or a redo) unticks it.
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const busy = busyAction !== null;
  const { approve, preview } = state;
  const schedulable = approve !== null && approve.problem === null;
  const confirmed = schedulable && confirmedAt === approve.publishAt;
  return (
    <div className="space-y-3">
      {schedulable ? (
        <Checkbox
          checked={confirmed}
          disabled={busy}
          onCheckedChange={(checked) => setConfirmedAt(checked ? approve.publishAt : null)}
        >
          Goes public {pacificTime.format(new Date(approve.publishAt))}. That&rsquo;s the right date and time.
        </Checkbox>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          disabled={busy || !confirmed}
          onClick={() => approve && void send({ action: "approve", id: job.id, publishAt: approve.publishAt }, "Approved. Scheduled on YouTube.")}
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
          disabled={!preview}
          onClick={() => preview && onReview(preview)}
        >
          Change details
        </Button>
      </div>
      <p className="text-[13px] text-muted-foreground">{AUTO_SCHEDULE_NOTE}</p>
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
      <FixHistory conversation={job.conversation} />
    </div>
  );
}

/** Under the edited show: its version, when it finished and what it cost. */
function editDetails(job: ShowEditView, sent: boolean) {
  const parts = [`Version ${job.version}`];
  if (job.finishedAt) parts.push(`finished ${pacificTime.format(new Date(job.finishedAt))}`);
  if (job.costUsd !== null) parts.push(`editing cost ${sent ? "" : "so far "}$${job.costUsd.toFixed(2)}`);
  return parts.join(" · ");
}

/**
 * At Review: the edited show, anything flagged, Approve or Send back; then what the editor found. Once it was sent
 * to YouTube the same cards stay, read-only: the show with its chapters, the flags, the send-backs and the cost.
 */
function ReviewCards({ state, job, sentToYouTube, busyAction, send, onReview }: {
  state: ShowEditState; job: ShowEditView; sentToYouTube: boolean; busyAction: EditAction["action"] | null; send: Send;
  onReview: (edited: EditedShow) => void;
}) {
  const found = structureDecisions(job.decisions).length > 0;
  return (
    <>
      <Panel
        title={sentToYouTube ? "The edited show" : "Review"}
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
            chapters={chaptersOf(job.checks)}
          />
        ) : null}
        <FlaggedDecisions
          decisions={job.decisions}
          failures={failuresOf(job)}
          {...(sentToYouTube ? { title: "Flagged by the editor" } : {})}
        />
        {sentToYouTube ? (
          <FixHistory conversation={job.conversation} />
        ) : (
          <ReviewActions state={state} job={job} busyAction={busyAction} send={send} onReview={onReview} />
        )}
        <p className="text-[13px] text-muted-foreground">{editDetails(job, sentToYouTube)}</p>
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
        {job?.note && !canStart ? (
          <p className="text-[13px] text-muted-foreground">Instructions: &ldquo;{job.note}&rdquo;</p>
        ) : null}
        {job?.recomposite && !canStart ? <InlineNote tone="warning">{RECOMPOSITE_USED}</InlineNote> : null}
        {job?.publishAt && !canStart ? (
          <p className="text-[13px] text-muted-foreground">Goes public: {pacificTime.format(new Date(job.publishAt))} (picked with the instructions)</p>
        ) : null}
        {job && !isActiveJob(job) ? <DebugLogLinks logs={job.debugLogs} /> : null}
        {canStart ? (
          <StartRow
            key={showDate}
            showDate={showDate}
            selected={selected}
            selectionError={sourceSelectionError(selected)}
            packages={state.packages}
            announcements={state.announcements}
            busy={busy}
            starting={busyAction === "start"}
            online={state.worker.online}
            onStart={(note, publish, recomposite) => void send(
              {
                action: "start", date: showDate, sources: selected, ...(note ? { note } : {}), ...(publish ? { publish } : {}),
                ...(recomposite ? { recomposite: true } : {})
              },
              "Automatic editing queued."
            )}
          />
        ) : null}
        {(job?.status === "FAILED" || job?.status === "REVIEW") && !sentToYouTube ? (
          <RedoControl
            key={job.id}
            busy={busy}
            recomposite={job.recomposite}
            onRedo={(note, recomposite) => send({ action: "redo", id: job.id, ...(note ? { note } : {}), recomposite }, "Starting the edit over.")}
          />
        ) : null}
      </Panel>
      {job && (job.status === "REVIEW" || (job.status === "PUBLISHED" && sentToYouTube)) ? (
        <ReviewCards state={state} job={job} sentToYouTube={sentToYouTube} busyAction={busyAction} send={send} onReview={onReview} />
      ) : null}
      {canStart ? (
        <RecordingsCard state={state} selected={selected} busy={busy} onChange={(sources) => setPicked({ date: showDate, sources })} />
      ) : null}
    </div>
  );
}
