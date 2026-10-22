"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Loader2, RotateCcw } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  editorStatus, SHOW_EDIT_FIX_MAX, SHOW_EDIT_NOTE_MAX,
  type ShowEditApprovePreview, type ShowEditDecision, type ShowEditMessage, type ShowEditorDeviceView, type ShowEditPublished,
  type ShowEditWorker
} from "@/src/lib/show-editor";
import type { ShowEditDebugLog } from "@/src/lib/show-editor-debug-logs";

export const LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

export const pacificTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
});

/** The Editing header's editor pill: online or offline, the active machine and its version. */
export function EditorStatusTag({ worker, devices }: { worker: ShowEditWorker; devices: ShowEditorDeviceView[] }) {
  if (devices.length === 0) return <StatusTag tone="danger" dot>No editor linked</StatusTag>;
  const status = editorStatus(worker, new Date(), devices.find((device) => device.active)?.name);
  return <StatusTag tone={status.tone} dot>{status.label}</StatusTag>;
}

export function FlaggedDecisions({ decisions, failures, title = "Check these before scheduling" }: {
  decisions: ShowEditDecision[]; failures: { rule?: string; detail?: string }[]; title?: string;
}) {
  const flagged = decisions.filter((decision) => decision.flagged);
  if (flagged.length === 0 && failures.length === 0) return null;
  // A package flag usually means one wasn't queued: say where to fix it.
  const packageFlag = flagged.some((decision) => decision.kind === "package");
  return (
    <Alert tone="warning" title={title} compact>
      <ul className="list-disc space-y-0.5 pl-4">
        {flagged.map((decision, index) => <li key={`d${index}`}>{decision.detail}</li>)}
        {failures.map((failure, index) => <li key={`f${index}`}>{failure.detail ?? failure.rule}</li>)}
      </ul>
      {packageFlag ? (
        <p className="mt-2">
          Missing a package? Queue it with its final cut in the{" "}
          <Link href="/publishing-queue" className="underline underline-offset-2">Publishing Queue</Link>, then press{" "}
          <strong>Redo automatic edit</strong>.
        </p>
      ) : null}
    </Alert>
  );
}

/** A text box with a submit button; Redo uses it for the note, Send back for what needs to change. */
function NoteForm({
  label, placeholder, max, submitLabel, busy, onSubmit, extra, optional = false
}: {
  label: string;
  placeholder: string;
  max: number;
  submitLabel: string;
  busy: boolean;
  onSubmit: (text: string, remember: boolean) => Promise<boolean>;
  extra?: "remember";
  /** Can be sent empty. */
  optional?: boolean;
}) {
  const [text, setText] = useState("");
  const [remember, setRemember] = useState(false);
  const id = `show-edit-${submitLabel.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!optional && !text.trim()) return;
        void onSubmit(text.trim(), remember).then((done) => {
          if (done) {
            setText("");
            setRemember(false);
          }
        });
      }}
    >
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <Textarea id={id} rows={3} value={text} maxLength={max} placeholder={placeholder} onChange={(event) => setText(event.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {extra === "remember" ? (
          <Checkbox checked={remember} onCheckedChange={setRemember}>Remember this for future shows</Checkbox>
        ) : <span />}
        <Button type="submit" variant="outline" disabled={busy || (!optional && !text.trim())}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function RedoForm({ busy, onRedo }: { busy: boolean; onRedo: (note: string) => Promise<boolean> }) {
  return (
    <NoteForm
      label="Note for the editor (optional)"
      placeholder="What should it do differently? e.g. Use the later take of the close."
      max={SHOW_EDIT_NOTE_MAX}
      submitLabel="Redo the edit"
      busy={busy}
      onSubmit={(note) => onRedo(note)}
      optional
    />
  );
}

/** Approve & schedule's line: what it will schedule and when, or why it can't yet. */
export function approveLine(approve: ShowEditApprovePreview | null) {
  if (!approve) return "Couldn't read the usual title and time. Use Change details.";
  if (approve.problem) return approve.problem;
  return `Schedules “${approve.title}” for ${pacificTime.format(new Date(approve.publishAt))}.`;
}

const SENDING = new Set(["UPLOADING", "PROCESSING", "FINALIZING"]);

/** Once the show was sent to YouTube: where it stands there, and that changes now happen in YouTube Studio. */
export function sentLine(published: ShowEditPublished | null) {
  if (!published) return "This show was sent to YouTube. Make changes in YouTube Studio.";
  const when = pacificTime.format(new Date(published.publishAt));
  if (SENDING.has(published.status)) return `Sending it to YouTube now. It goes public ${when}.`;
  if (published.status === "FAILED") return "Sending it to YouTube needs attention. Open Upload show to see why.";
  if (published.status === "LIVE") return `Public on YouTube since ${when}. Make changes in YouTube Studio.`;
  return `Scheduled on YouTube for ${when}. Make changes in YouTube Studio.`;
}

export const AUTO_SCHEDULE_NOTE = "If nobody approves, it's scheduled automatically at 8:00 AM on show day.";

/** Redo automatic edit: throws this edit away and edits the show again, with an optional note. */
export function RedoControl({ busy, onRedo }: { busy: boolean; onRedo: (note: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={busy} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <RotateCcw aria-hidden />
        Redo automatic edit
      </Button>
      {open ? (
        <RedoForm
          busy={busy}
          onRedo={async (note) => {
            const done = await onRedo(note);
            if (done) setOpen(false);
            return done;
          }}
        />
      ) : null}
    </div>
  );
}

/** Send back (remote prompting): what needs to change goes to the same editor session, which makes the next version. */
export function SendBackForm({ busy, onSendBack }: { busy: boolean; onSendBack: (text: string, remember: boolean) => Promise<boolean> }) {
  return (
    <NoteForm
      label="What needs to change?"
      placeholder="Timecodes help, e.g. At 1:12 the Math Club card is cut off."
      max={SHOW_EDIT_FIX_MAX}
      submitLabel="Send back to the editor"
      busy={busy}
      onSubmit={onSendBack}
      extra="remember"
    />
  );
}

/** The producers' send-backs and the editor's replies, oldest first. */
export function FixHistory({ conversation }: { conversation: ShowEditMessage[] }) {
  if (conversation.length === 0) return null;
  return (
    <ol className="space-y-2 text-sm" aria-label="Send-backs and replies">
      {conversation.map((entry, index) => (
        <li key={index} className={entry.from === "producer" ? "rounded-md border border-border p-2.5" : "rounded-md bg-[var(--ink-2)] p-2.5"}>
          <div className={LABEL_CLASS}>
            {entry.from === "producer" ? "Producer" : `Editor${entry.version ? ` · v${entry.version}` : ""}`}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{entry.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Decision kinds the editor uses to report which files it found to be what (recordings, cameras, skipped copies). */
const STRUCTURE_KINDS = new Set(["structure", "recordings"]);

/** What the editor reported about the files themselves (recordings, cameras, skipped copies). */
export function structureDecisions(decisions: ShowEditDecision[]) {
  return decisions.filter((decision) => STRUCTURE_KINDS.has(decision.kind));
}

/** After an edit: what the editor worked out from the files, e.g. "2 recordings: r1 multicam (M, L, R), …". */
export function DetectedStructure({ decisions }: { decisions: ShowEditDecision[] }) {
  const found = structureDecisions(decisions);
  if (found.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-sm">
      {found.map((decision, index) => (
        <li key={index} className={decision.flagged ? "text-[var(--brand-amber)]" : undefined}>{decision.detail}</li>
      ))}
    </ul>
  );
}

const DEBUG_LOG_HINT = "Editor log and AI transcript for this run. Share it when reporting a problem.";
export const LINK_CLASS = "inline-flex items-center gap-1.5 text-[var(--brand-green)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DebugLogLink({ log, label }: { log: ShowEditDebugLog & { url: string }; label: string }) {
  return (
    <a href={log.url} download rel="noreferrer" title={DEBUG_LOG_HINT} aria-label={`Download debug log (v${log.version})`} className={LINK_CLASS}>
      <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </a>
  );
}

/** The newest run's debug bundle, with earlier versions' bundles behind a disclosure. */
export function DebugLogLinks({ logs }: { logs: ShowEditDebugLog[] }) {
  const linked = logs.filter((log): log is ShowEditDebugLog & { url: string } => log.url !== null);
  if (linked.length === 0) return null;
  const [latest, ...earlier] = linked;
  return (
    <div className="space-y-1.5 text-[13px]">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-foreground">Debug log (v{latest.version})</span>
        <DebugLogLink log={latest} label="Download debug log" />
      </p>
      <p className="text-muted-foreground">{DEBUG_LOG_HINT}</p>
      {earlier.length > 0 ? (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
            Earlier versions ({earlier.length})
          </summary>
          <ul className="mt-1.5 space-y-1 pl-5">
            {earlier.map((log) => (
              <li key={`${log.version}-${log.at}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <DebugLogLink log={log} label={`Debug log (v${log.version})`} />
                <span className="text-muted-foreground">{pacificTime.format(new Date(log.at))}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
