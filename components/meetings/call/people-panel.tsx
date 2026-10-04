"use client";

import { useState } from "react";
import { Hand, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MeetingClientMessage, MeetingParticipantView, MeetingWaitingView } from "@/src/lib/meetings/protocol";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { ConfirmDialog } from "../confirm-dialog";
import { Avatar } from "./avatar";
import { PeopleRow } from "./people-row";
import { SidePanel } from "./side-panel";

export function PeoplePanel({
  meetingId,
  selfUid,
  isHost,
  participants,
  hands,
  waiting,
  send,
  onClose,
  mobile
}: {
  meetingId: string;
  selfUid: string | null;
  isHost: boolean;
  participants: MeetingParticipantView[];
  /** uid → raised-hand queue position. */
  hands: Readonly<Record<string, number>>;
  waiting: readonly MeetingWaitingView[];
  send: (message: MeetingClientMessage) => boolean;
  onClose: () => void;
  mobile: boolean;
}) {
  const [removing, setRemoving] = useState<MeetingParticipantView | null>(null);
  const people = participants.filter((p) => !p.isScribe);
  const raised = people.filter((p) => hands[p.uid]).sort((a, b) => hands[a.uid] - hands[b.uid]);
  const others = people.filter((p) => !hands[p.uid]);

  async function act(promise: Promise<unknown>, done: string) {
    try {
      await promise;
      toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  const hostSend = (message: MeetingClientMessage, done: string) => {
    if (send(message)) toast.success(done);
    else toast.error("You're offline. Try again in a moment.");
  };

  const row = (p: MeetingParticipantView) => (
    <PeopleRow
      key={p.uid}
      person={p}
      isSelf={p.uid === selfUid}
      isHost={isHost}
      handPosition={hands[p.uid]}
      hostSend={hostSend}
      onRemove={() => setRemoving(p)}
    />
  );

  return (
    <SidePanel title={`People (${people.length})`} onClose={onClose} mobile={mobile}>
      {isHost && waiting.length > 0 ? (
        <section className="border-b border-[var(--ink-4)] p-4" aria-label="Waiting to join">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Waiting to join</h3>
            {waiting.length > 1 ? (
              <Button size="sm" className="h-11 md:h-8" onClick={() => void act(meetingsApi.admitAll(meetingId), "Let everyone in.").catch(() => undefined)}>
                Admit all
              </Button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {waiting.map((w) => (
              <li key={w.uid} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={w.name} size="sm" />
                  <span className="truncate text-sm text-foreground">{w.name}</span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" className="h-11 md:h-8" onClick={() => void act(meetingsApi.participant(meetingId, w.uid, "deny"), `Didn't let ${w.name} in.`).catch(() => undefined)}>
                    Deny
                  </Button>
                  <Button size="sm" className="h-11 md:h-8" onClick={() => void act(meetingsApi.participant(meetingId, w.uid, "admit"), `Let ${w.name} in.`).catch(() => undefined)}>
                    Admit
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isHost ? (
        <div className="flex flex-wrap gap-2 border-b border-[var(--ink-4)] p-4">
          <Button size="sm" variant="outline" className="h-11 md:h-8" onClick={() => hostSend({ t: "muteAll" }, "Muted everyone.")}>
            <MicOff aria-hidden /> Mute all
          </Button>
        </div>
      ) : null}

      {raised.length > 0 ? (
        <section aria-label="Raised hands" className="border-b border-[var(--ink-4)] py-2">
          <div className="flex h-11 items-center justify-between pl-4 pr-2">
            <h3 className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Raised hands</h3>
            {isHost ? (
              <Button size="sm" variant="outline" className="h-11 md:h-8" onClick={() => hostSend({ t: "lowerAllHands" }, "Lowered all hands.")}>
                <Hand aria-hidden /> Lower all
              </Button>
            ) : null}
          </div>
          <ul>{raised.map(row)}</ul>
        </section>
      ) : null}

      <ul className="py-2" aria-label="In the meeting">
        {others.map(row)}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        description="They leave the call right away and can't rejoin. The meeting key changes for everyone."
        confirmLabel="Remove"
        onConfirm={() => (removing ? act(meetingsApi.participant(meetingId, removing.uid, "remove"), `Removed ${removing.name}.`) : undefined)}
      />
    </SidePanel>
  );
}
