"use client";

import type { ReactNode } from "react";
import { Hand, Mic, MicOff, UserMinus } from "lucide-react";
import type { MeetingClientMessage, MeetingParticipantView } from "@/src/lib/meetings/protocol";
import { Avatar } from "./avatar";
import { HandBadge } from "./hand-badge";

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
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

/** One person: avatar, name, Host tag, then hand / mic / remove on the right. */
export function PeopleRow({
  person,
  isSelf,
  isHost,
  handPosition,
  hostSend,
  onRemove
}: {
  person: MeetingParticipantView;
  isSelf: boolean;
  isHost: boolean;
  handPosition?: number;
  hostSend: (message: MeetingClientMessage, done: string) => void;
  onRemove: () => void;
}) {
  const p = person;
  return (
    <li className="flex items-center gap-3 py-1.5 pl-4 pr-2">
      <Avatar name={p.name} size="sm" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-foreground">
          {p.name}
          {isSelf ? " (You)" : ""}
        </span>
        {p.isHost ? (
          <span className="shrink-0 rounded-sm border border-[var(--ink-4)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            Host
          </span>
        ) : null}
      </div>
      {handPosition ? <HandBadge position={handPosition} compact /> : null}
      {handPosition && isHost ? (
        <IconAction label={`Lower ${p.name}'s hand`} onClick={() => hostSend({ t: "lowerHand", uid: p.uid }, `Lowered ${p.name}'s hand.`)}>
          <Hand className="h-4 w-4" />
        </IconAction>
      ) : null}
      {isHost && !isSelf && p.audioOn ? (
        <IconAction label={`Mute ${p.name}`} onClick={() => hostSend({ t: "mute", uid: p.uid, kind: "audio" }, `Muted ${p.name}.`)}>
          <Mic className="h-4 w-4" />
        </IconAction>
      ) : (
        <span className="flex h-11 w-11 items-center justify-center text-muted-foreground" aria-label={p.audioOn ? "Microphone on" : "Microphone off"}>
          {p.audioOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </span>
      )}
      {isHost && !isSelf ? (
        <IconAction label={`Remove ${p.name}`} onClick={onRemove}>
          <UserMinus className="h-4 w-4 text-danger" />
        </IconAction>
      ) : null}
    </li>
  );
}
