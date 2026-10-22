"use client";

import { Download } from "lucide-react";
import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { SHOW_EDIT_BACKEND_LABELS, type ShowEditState } from "@/src/lib/show-editor";
import { EDITOR_SETUP_APP_URL } from "@/src/lib/show-editor-views";
import { ConnectAiAccount, EditingMachines, type ShownPairing } from "./show-edit-machines";
import { LinkConfirm } from "./show-edit-settings";
import type { EditAction } from "./use-show-edit";

/** A new machine starts here: the setup app installs everything, then shows a code to link it. */
function SetupAppDownload() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <a href={EDITOR_SETUP_APP_URL} className={buttonVariants({ variant: "outline" })}>
        <Download aria-hidden />
        Download the setup app
      </a>
      <span className="text-[13px] text-muted-foreground">
        Open it on the Mac that will edit and follow the steps. It installs everything, then shows a code to link it here.
      </span>
    </div>
  );
}

/**
 * The Machines view: a waiting link approval (`?link=CODE`), the setup app for a new machine, every linked
 * editing machine with its buttons and command results, and Connect AI account.
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
        bodyClassName="space-y-4"
      >
        <SetupAppDownload />
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
