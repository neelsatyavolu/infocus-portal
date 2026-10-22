"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  editorStatus, SHOW_EDIT_FIX_MAX, SHOW_EDIT_NOTE_MAX,
  type ShowEditDecision, type ShowEditMessage, type ShowEditorDeviceView, type ShowEditWorker
} from "@/src/lib/show-editor";

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

export function FlaggedDecisions({ decisions, failures }: { decisions: ShowEditDecision[]; failures: { rule?: string; detail?: string }[] }) {
  const flagged = decisions.filter((decision) => decision.flagged);
  if (flagged.length === 0 && failures.length === 0) return null;
  return (
    <Alert tone="warning" title="Check these before scheduling" compact>
      <ul className="list-disc space-y-0.5 pl-4">
        {flagged.map((decision, index) => <li key={`d${index}`}>{decision.detail}</li>)}
        {failures.map((failure, index) => <li key={`f${index}`}>{failure.detail ?? failure.rule}</li>)}
      </ul>
    </Alert>
  );
}

/** A text box with a submit button; Redo uses it for the note, the fix box for the request. */
function NoteForm({
  label, placeholder, max, submitLabel, busy, onSubmit, extra
}: {
  label: string;
  placeholder: string;
  max: number;
  submitLabel: string;
  busy: boolean;
  onSubmit: (text: string, remember: boolean) => Promise<boolean>;
  extra?: "remember";
}) {
  const [text, setText] = useState("");
  const [remember, setRemember] = useState(false);
  const id = `show-edit-${submitLabel.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
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
        <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
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
      label="Redo with a note for the editor"
      placeholder="What should it do differently? e.g. Use the later take of the close."
      max={SHOW_EDIT_NOTE_MAX}
      submitLabel="Redo the edit"
      busy={busy}
      onSubmit={(note) => onRedo(note)}
    />
  );
}

/** Remote prompting: the producer's requests and the editor's replies, then the box for the next one. */
export function FixConversation({
  conversation, busy, onFix
}: {
  conversation: ShowEditMessage[];
  busy: boolean;
  onFix: (text: string, remember: boolean) => Promise<boolean>;
}) {
  return (
    <div className="space-y-3">
      {conversation.length > 0 ? (
        <ol className="space-y-2 text-sm" aria-label="Fix requests and replies">
          {conversation.map((entry, index) => (
            <li key={index} className={entry.from === "producer" ? "rounded-md border border-border p-2.5" : "rounded-md bg-[var(--ink-2)] p-2.5"}>
              <div className={LABEL_CLASS}>
                {entry.from === "producer" ? "Producer" : `Editor${entry.version ? ` · v${entry.version}` : ""}`}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{entry.text}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <NoteForm
        label="Ask for a fix"
        placeholder="What's wrong? Timecodes help, e.g. At 1:12 the Math Club card is cut off."
        max={SHOW_EDIT_FIX_MAX}
        submitLabel="Send the fix"
        busy={busy}
        onSubmit={onFix}
        extra="remember"
      />
    </div>
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
