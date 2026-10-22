"use client";

import { Panel } from "@/components/kit/panel";
import { SHOW_EDIT_BACKEND_LABELS, type ShowEditState } from "@/src/lib/show-editor";
import { ConnectAiAccount, EditingMachines, type ShownPairing } from "./show-edit-machines";
import { LinkConfirm } from "./show-edit-settings";
import type { EditAction } from "./use-show-edit";

/**
 * The Machines view: a waiting link approval (`?link=CODE`), every linked editing machine with its buttons
 * and command results, and Connect AI account.
 */
export function EditingMachinesView({ state, linkCode, pairing, busy, send, onLinkDone }: {
  state: ShowEditState;
  linkCode: string | null;
  pairing: ShownPairing | null;
  busy: boolean;
  send: (body: EditAction, success?: string) => Promise<boolean>;
  onLinkDone: (message: string | null) => void;
}) {
  const { devices } = state;
  return (
    <div className="space-y-5">
      {linkCode ? <LinkConfirm code={linkCode} devices={devices} onDone={onLinkDone} /> : null}
      <Panel
        title="Editing machines"
        count={devices.length}
        description="The active machine takes new edits. Commands run within about a minute; the latest result shows under each machine."
      >
        <EditingMachines
          devices={devices}
          pairings={state.pairings}
          commands={state.commands}
          busy={busy}
          onActivate={(deviceId) => void send({ action: "activate", deviceId }, "Active editor switched.")}
          onUnlink={(deviceId) => void send({ action: "unlink", deviceId }, "Unlinked.")}
          onCommand={(deviceId, kind) => void send({ action: "command", deviceId, kind })}
        />
      </Panel>
      {devices.length > 0 ? (
        <Panel title="Connect AI account" description="Editing machines run on a Claude, Codex or Grok subscription.">
          <ConnectAiAccount
            devices={devices}
            pairings={state.pairings}
            shown={pairing}
            busy={busy}
            onConnect={(deviceId, backend) => void send({ action: "pair", backend, deviceId }, `Code ready for ${SHOW_EDIT_BACKEND_LABELS[backend]}.`)}
          />
        </Panel>
      ) : null}
    </div>
  );
}
