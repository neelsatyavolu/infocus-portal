"use client";

import { useState } from "react";
import { Hand, Mic, MicOff, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MeetingClientMessage, MeetingParticipantView, MeetingWaitingView } from "@/src/lib/meetings/protocol";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { ConfirmDialog } from "../confirm-dialog";
import { SidePanel } from "./side-panel";

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
    >
      {children}
    </button>
  );
}

export function PeoplePanel({
  meetingId,
  selfUid,
  isHost,
  participants,
  waiting,
  send,
  onClose,
  mobile
}: {
  meetingId: string;
  selfUid: string | null;
  isHost: boolean;
  participants: MeetingParticipantView[];
  waiting: readonly MeetingWaitingView[];
  send: (message: MeetingClientMessage) => boolean;
  onClose: () => void;
  mobile: boolean;
}) {
  const [removing, setRemoving] = useState<MeetingParticipantView | null>(null);
  const people = participants.filter((p) => !p.isScribe);
  const anyHands = people.some((p) => p.handRaisedAt !== null);

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
                <span className="truncate text-sm text-foreground">{w.name}</span>
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
          {anyHands ? (
            <Button size="sm" variant="outline" className="h-11 md:h-8" onClick={() => hostSend({ t: "lowerAllHands" }, "Lowered all hands.")}>
              <Hand aria-hidden /> Lower all hands
            </Button>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-[var(--ink-4)]">
        {people.map((p) => {
          const self = p.uid === selfUid;
          return (
            <li key={p.uid} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {p.name}
                  {self ? " (You)" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.isHost ? "Host" : "Producer"}
                  {p.handRaisedAt !== null ? " · Hand raised" : ""}
                </p>
              </div>
              {p.handRaisedAt !== null && isHost ? (
                <IconAction label={`Lower ${p.name}'s hand`} onClick={() => hostSend({ t: "lowerHand", uid: p.uid }, `Lowered ${p.name}'s hand.`)}>
                  <Hand className="h-4 w-4" />
                </IconAction>
              ) : null}
              {isHost && !self && p.audioOn ? (
                <IconAction label={`Mute ${p.name}`} onClick={() => hostSend({ t: "mute", uid: p.uid, kind: "audio" }, `Muted ${p.name}.`)}>
                  <Mic className="h-4 w-4" />
                </IconAction>
              ) : (
                <span className="flex h-11 w-11 items-center justify-center text-muted-foreground" aria-label={p.audioOn ? "Microphone on" : "Microphone off"}>
                  {p.audioOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </span>
              )}
              {isHost && !self ? (
                <IconAction label={`Remove ${p.name}`} onClick={() => setRemoving(p)}>
                  <UserMinus className="h-4 w-4 text-danger" />
                </IconAction>
              ) : null}
            </li>
          );
        })}
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
