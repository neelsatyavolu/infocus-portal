"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Play, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, InlineNote } from "@/components/kit/alert";
import { Disclosure } from "@/components/kit/disclosure";
import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import {
  defaultRecordingSelection, SHOW_EDIT_BACKEND_LABELS, SHOW_EDIT_STAGE_LABELS, SHOW_EDITOR_COMMAND_LABELS,
  type ShowEditBackend, type ShowEditorCommandKind, type ShowEditState, type ShowEditView
} from "@/src/lib/show-editor";
import type { EditedShow } from "./show-upload-dialog";
import { EditingMachines, type ShownPairing } from "./show-edit-machines";
import {
  EditorStatusTag, FixConversation, FlaggedDecisions, RecordingPicker, RedoForm
} from "./show-edit-parts";
import { EditorSettingsForm, LinkConfirm, type SettingsPatch } from "./show-edit-settings";

const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;
const OFFLINE_NOTE = "The editing machine is offline. The job will start when it's back.";

type Action =
  | { action: "start"; date: string; sourcePaths: string[] }
  | { action: "cancel"; id: string }
  | { action: "redo"; id: string; note: string }
  | { action: "fix"; id: string; text: string; remember: boolean }
  | { action: "pair"; backend: ShowEditBackend; deviceId: string }
  | { action: "activate"; deviceId: string }
  | { action: "unlink"; deviceId: string }
  | { action: "command"; deviceId: string; kind: ShowEditorCommandKind }
  | ({ action: "settings" } & SettingsPatch);

function isActive(job: ShowEditView | null) {
  return job?.status === "QUEUED" || job?.status === "RUNNING";
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

/**
 * Automatic editing on The Show (producers only; the route answers 403 to everyone else, and then
 * the panel stays hidden). Start → live stage line → review with fixes, or Redo.
 */
export function ShowEditPanel({
  showDate,
  refreshKey,
  onReview,
  className
}: {
  showDate: string;
  refreshKey: number;
  onReview: (edited: EditedShow) => void;
  className?: string;
}) {
  const [state, setState] = useState<ShowEditState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<Action["action"] | null>(null);
  const [picked, setPicked] = useState<{ date: string; paths: string[] } | null>(null);
  const [pairing, setPairing] = useState<ShownPairing | null>(null);
  const linkCode = useSearchParams().get("link");
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(
    () =>
      fetch(`/api/show-roles/edits?date=${encodeURIComponent(showDate)}`, { cache: "no-store" }).then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setHidden(true);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { data?: ShowEditState; error?: { message?: string } };
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not load automatic editing.");
        setHidden(false);
        setState(body.data);
      }),
    [showDate]
  );

  useEffect(() => {
    void load().catch(() => {});
  }, [load, refreshKey]);

  const pairingInFlight = (state?.pairings ?? []).some((entry) => entry.status === "waiting" || entry.status === "sent");
  const active = isActive(state?.job ?? null) || pairingInFlight;
  useEffect(() => {
    if (hidden) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load().catch(() => {});
    }, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, active, hidden]);

  async function send(body: Action, success?: string) {
    setBusy(body.action);
    try {
      const response = await fetch("/api/show-roles/edits", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "That didn't work. Try again.");
      if (body.action === "pair") {
        setPairing({ backend: body.backend, ...(payload.data as Omit<ShownPairing, "backend">) });
      }
      if (body.action === "command") toast.success(`${SHOW_EDITOR_COMMAND_LABELS[body.kind]} sent. The result shows here in about a minute.`);
      if (success) toast.success(success);
      await load().catch(() => {});
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function closeLink(message: string | null) {
    if (message) toast(message);
    const params = new URLSearchParams(window.location.search);
    params.delete("link");
    const query = params.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
    void load().catch(() => {});
  }

  if (hidden || !state) return null;
  const { worker, job } = state;
  const sentToYouTube = state.publicationStatus !== null && state.publicationStatus !== "DRAFT";
  const selected = picked?.date === showDate ? picked.paths : defaultRecordingSelection(state.recordings, showDate);
  const canStart = !sentToYouTube && (!job || ["FAILED", "CANCELLED"].includes(job.status));

  const startSection = canStart ? (
    <div className="space-y-3">
      {state.recordingsError ? <Alert tone="danger" compact>{state.recordingsError}</Alert> : null}
      <RecordingPicker
        recordings={state.recordings}
        selected={selected}
        disabled={busy !== null}
        onChange={(paths) => setPicked({ date: showDate, paths })}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy !== null || selected.length === 0}
          onClick={() => void send({ action: "start", date: showDate, sourcePaths: selected }, "Automatic editing queued.")}
        >
          {busy === "start" ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
          Start automatic editing
        </Button>
        {!worker.online ? <InlineNote>{OFFLINE_NOTE}</InlineNote> : null}
      </div>
    </div>
  ) : null;

  return (
    <Panel
      title="Automatic editing"
      status={<EditorStatusTag worker={worker} />}
      className={className}
      bodyClassName="space-y-4"
    >
      {linkCode ? <LinkConfirm code={linkCode} devices={state.devices} onDone={closeLink} /> : null}

      {job && isActive(job) ? (
        <div className="space-y-3">
          <p aria-live="polite" className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            {progressLine(job, state.waitingFor)}
          </p>
          {!worker.online ? <InlineNote>{OFFLINE_NOTE}</InlineNote> : null}
          <Button
            type="button"
            variant="destructive-quiet"
            disabled={busy !== null || job.cancelRequested}
            onClick={() => void send({ action: "cancel", id: job.id })}
          >
            {job.cancelRequested ? "Cancelling…" : job.pendingFix ? "Cancel the fix" : "Cancel"}
          </Button>
        </div>
      ) : null}

      {job?.status === "REVIEW" ? (
        <div className="space-y-4">
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
            <span className="text-[13px] text-muted-foreground">
              Version {job.version}
              {job.costUsd !== null ? ` · editing cost so far $${job.costUsd.toFixed(2)}` : ""}
            </span>
          </div>
          {!sentToYouTube ? (
            <FixConversation
              conversation={job.conversation}
              busy={busy !== null}
              onFix={(text, remember) => send({ action: "fix", id: job.id, text, remember }, "Fix sent to the editor.")}
            />
          ) : null}
          {!sentToYouTube ? (
            <RedoForm busy={busy !== null} onRedo={(note) => send({ action: "redo", id: job.id, note }, "Starting the edit over.")} />
          ) : null}
        </div>
      ) : null}

      {job?.status === "FAILED" ? (
        <div className="space-y-3">
          <Alert tone="danger" title="The automatic edit failed" compact>{job.error ?? "Unknown error."}</Alert>
          {!sentToYouTube ? (
            <RedoForm busy={busy !== null} onRedo={(note) => send({ action: "redo", id: job.id, note }, "Starting the edit over.")} />
          ) : null}
        </div>
      ) : null}

      {job?.status === "CANCELLED" ? <p className="text-sm text-muted-foreground">The last automatic edit was cancelled.</p> : null}

      {job?.status === "PUBLISHED" || (sentToYouTube && job?.status !== "FAILED") ? (
        <p className="text-sm text-muted-foreground">This show was sent to YouTube. Make changes in YouTube Studio.</p>
      ) : null}

      {startSection}

      <Disclosure
        summary="Editing machines"
        count={state.devices.length}
        defaultOpen={state.devices.length === 0 || state.devices.some((device) => device.health && !device.health.ok)}
        storageKey="show-editor:machines:v1"
      >
        <EditingMachines
          devices={state.devices}
          pairings={state.pairings}
          commands={state.commands}
          shown={pairing}
          busy={busy !== null}
          onActivate={(deviceId) => void send({ action: "activate", deviceId }, "Active editor switched.")}
          onUnlink={(deviceId) => void send({ action: "unlink", deviceId }, "Unlinked.")}
          onCommand={(deviceId, kind) => void send({ action: "command", deviceId, kind })}
          onConnect={(deviceId, backend) => void send({ action: "pair", backend, deviceId }, `Code ready for ${SHOW_EDIT_BACKEND_LABELS[backend]}.`)}
        />
      </Disclosure>

      <Disclosure summary="Editor settings" storageKey="show-editor:settings:v1">
        <EditorSettingsForm
          key={state.settings.updatedAt ?? "default"}
          settings={state.settings}
          busy={busy !== null}
          onSave={(patch) => send({ action: "settings", ...patch }, "Saved.")}
        />
      </Disclosure>
    </Panel>
  );
}
