"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  lastSeenLabel, SHOW_EDIT_BACKEND_LABELS, SHOW_EDIT_BACKENDS, SHOW_EDITOR_COMMAND_LABELS, SHOW_EDITOR_COMMANDS,
  type PairingStatus, type ShowEditBackend, type ShowEditorCommandKind, type ShowEditorCommandView, type ShowEditorDeviceView
} from "@/src/lib/show-editor";
import { LABEL_CLASS, pacificTime } from "./show-edit-parts";

export type ShownPairing = { deviceId: string; backend: ShowEditBackend; code: string; command: string; expiresAt: string };

const PAIRING_COPY = "Run this on your computer. You'll sign in there; the editing Mac gets the login, encrypted.";

function backendTag(connected: boolean, pairing: PairingStatus | undefined) {
  if (pairing?.status === "waiting") return <StatusTag tone="info">Waiting for sign-in</StatusTag>;
  if (pairing?.status === "sent") return <StatusTag tone="info">Installing</StatusTag>;
  if (connected) return <StatusTag tone="success" dot>Connected</StatusTag>;
  if (pairing?.status === "failed") return <StatusTag tone="danger">Failed</StatusTag>;
  return <StatusTag tone="neutral">Not connected</StatusTag>;
}

function MachineAiAccounts({ device, pairings }: { device: ShowEditorDeviceView; pairings: PairingStatus[] }) {
  return (
    <ul className="space-y-1 text-sm" aria-label={`AI accounts on ${device.name}`}>
      {SHOW_EDIT_BACKENDS.map((backend) => {
        const reported = device.backends.find((entry) => entry.name === backend);
        const pairing = pairings.find((entry) => entry.deviceId === device.id && entry.backend === backend);
        const note = pairing?.status === "failed" && !reported?.connected ? pairing.error : reported?.detail;
        return (
          <li key={backend} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-14 text-[13px]">{SHOW_EDIT_BACKEND_LABELS[backend]}</span>
            {backendTag(Boolean(reported?.connected), pairing)}
            {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The latest result of each command on one machine; the log gets a scrollable block. */
function CommandResults({ commands }: { commands: ShowEditorCommandView[] }) {
  const latest = SHOW_EDITOR_COMMANDS.flatMap((kind) => {
    const command = commands.find((entry) => entry.kind === kind);
    return command ? [command] : [];
  });
  if (latest.length === 0) return null;
  return (
    <ul className="space-y-2 text-sm">
      {latest.map((command) => (
        <li key={command.id} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{SHOW_EDITOR_COMMAND_LABELS[command.kind]}</span>
            <StatusTag tone={command.status === "DONE" ? "success" : command.status === "FAILED" ? "danger" : "info"}>
              {command.status === "PENDING" ? "Waiting" : command.status === "SENT" ? "Running" : command.status === "DONE" ? "Done" : "Failed"}
            </StatusTag>
            <span className="text-[12px] text-muted-foreground">{pacificTime.format(new Date(command.finishedAt ?? command.createdAt))}</span>
          </div>
          {command.output ? (
            <pre
              className={`overflow-auto whitespace-pre-wrap rounded bg-[var(--ink-2)] p-2 font-mono text-[12px] ${command.kind === "logs" ? "max-h-64" : "max-h-32"}`}
              tabIndex={0}
              aria-label={`${SHOW_EDITOR_COMMAND_LABELS[command.kind]} output`}
            >
              {command.output}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MachineRow({
  device, pairings, commands, busy, onActivate, onUnlink, onCommand
}: {
  device: ShowEditorDeviceView;
  pairings: PairingStatus[];
  commands: ShowEditorCommandView[];
  busy: boolean;
  onActivate: () => void;
  onUnlink: () => void;
  onCommand: (kind: ShowEditorCommandKind) => void;
}) {
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const problems = device.health && !device.health.ok ? device.health.problems : [];
  return (
    <li className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{device.name}</span>
        {device.active ? <StatusTag tone="success">Active</StatusTag> : null}
        <StatusTag tone="neutral">{device.kind === "personal" ? "Personal" : "Dedicated"}</StatusTag>
        <span className="text-[13px] text-muted-foreground">
          {device.online ? (device.busy ? "Online · busy" : "Online") : `Offline · last seen ${lastSeenLabel(device.lastSeenAt)}`}
          {device.version ? ` · ${device.version}` : ""}
        </span>
      </div>
      {problems.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-[var(--brand-amber)]" aria-label={`Problems on ${device.name}`}>
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      ) : null}
      <MachineAiAccounts device={device} pairings={pairings} />
      <div className="flex flex-wrap gap-2">
        {!device.active ? (
          <Button type="button" size="sm" disabled={busy} onClick={onActivate}>Make active</Button>
        ) : null}
        {SHOW_EDITOR_COMMANDS.map((kind) => (
          <Button key={kind} type="button" size="sm" variant="outline" disabled={busy} onClick={() => onCommand(kind)}>
            {SHOW_EDITOR_COMMAND_LABELS[kind]}
          </Button>
        ))}
        {confirmUnlink ? (
          <>
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={onUnlink}>Unlink {device.name}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmUnlink(false)}>Keep it</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="destructive-quiet" disabled={busy} onClick={() => setConfirmUnlink(true)}>Unlink</Button>
        )}
      </div>
      <CommandResults commands={commands} />
    </li>
  );
}

/** "Connect AI account": pick the machine (the active one by default) and the subscription, then run the command. */
function ConnectAiAccount({
  devices, pairings, shown, busy, onConnect
}: {
  devices: ShowEditorDeviceView[];
  pairings: PairingStatus[];
  shown: ShownPairing | null;
  busy: boolean;
  onConnect: (deviceId: string, backend: ShowEditBackend) => void;
}) {
  const active = devices.find((device) => device.active) ?? devices[0];
  const [machine, setMachine] = useState<string | null>(null);
  const target = devices.find((device) => device.id === machine) ?? active;
  const live = shown ? pairings.find((entry) => entry.deviceId === shown.deviceId && entry.backend === shown.backend) : undefined;
  // The command stays up until the machine has the sign-in (or the code failed).
  const showCommand = shown && (!live || live.status === "waiting" || live.status === "sent");
  if (!target) return null;
  return (
    <div className="space-y-2">
      <div className={LABEL_CLASS}>Connect AI account</div>
      <div className="flex flex-wrap items-center gap-2">
        {devices.length > 1 ? (
          <NativeSelect
            size="sm"
            aria-label="Machine"
            value={target.id}
            onChange={(event) => setMachine(event.target.value)}
            wrapperClassName="w-56"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>{device.name}{device.active ? " (active)" : ""}</option>
            ))}
          </NativeSelect>
        ) : null}
        {SHOW_EDIT_BACKENDS.map((backend) => (
          <Button key={backend} type="button" size="sm" variant="outline" disabled={busy} onClick={() => onConnect(target.id, backend)}>
            {SHOW_EDIT_BACKEND_LABELS[backend]}
          </Button>
        ))}
      </div>
      {showCommand && shown ? (
        <div className="space-y-2 rounded-md border border-border p-3" aria-live="polite">
          <p className="text-sm">{PAIRING_COPY}</p>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-[var(--ink-2)] px-2 py-1.5 font-mono text-[12px]">{shown.command}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(shown.command).then(
                  () => toast.success("Copied."),
                  () => toast.error("Couldn't copy. Select the text and copy it.")
                );
              }}
            >
              <Copy aria-hidden />
              Copy
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {live?.status === "sent"
              ? "Sign-in received. The editing machine is installing it…"
              : `Code ${shown.code} works once, until ${pacificTime.format(new Date(shown.expiresAt))}.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Every linked editing machine; exactly one is active and takes new edits. */
export function EditingMachines({
  devices, pairings, commands, shown, busy, onActivate, onUnlink, onCommand, onConnect
}: {
  devices: ShowEditorDeviceView[];
  pairings: PairingStatus[];
  commands: ShowEditorCommandView[];
  shown: ShownPairing | null;
  busy: boolean;
  onActivate: (deviceId: string) => void;
  onUnlink: (deviceId: string) => void;
  onCommand: (deviceId: string, kind: ShowEditorCommandKind) => void;
  onConnect: (deviceId: string, backend: ShowEditBackend) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={LABEL_CLASS}>Editing machines</div>
      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No editing machine is linked. Open the InFocus Editor app on the Mac and press Link to Portal.
        </p>
      ) : (
        <ul className="space-y-3">
          {devices.map((device) => (
            <MachineRow
              key={device.id}
              device={device}
              pairings={pairings}
              commands={commands.filter((command) => command.deviceId === device.id)}
              busy={busy}
              onActivate={() => onActivate(device.id)}
              onUnlink={() => onUnlink(device.id)}
              onCommand={(kind) => onCommand(device.id, kind)}
            />
          ))}
        </ul>
      )}
      {devices.length > 0 ? (
        <ConnectAiAccount devices={devices} pairings={pairings} shown={shown} busy={busy} onConnect={onConnect} />
      ) : null}
    </div>
  );
}
