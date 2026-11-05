"use client";

import type { ReactNode } from "react";
import { ArrowDown, Mic, MicOff, UserMinus } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { MeetingClientMessage, MeetingParticipantView, MeetingWaitingView } from "@/src/lib/meetings/protocol";
import { cn } from "@/src/lib/utils";
import { Avatar } from "./avatar";
import { IconButton } from "./call-button";
import { HandBadge } from "./hand-badge";

export type RowSize = "md" | "touch";

/** 48px rows (56px on phones), so a row never mixes control sizes. */
const ROW = { md: "min-h-12", touch: "min-h-14" } as const;
/** Fixed trailing columns, so hand / lower / mic / remove line up down the list. */
const COL = { md: "w-9", touch: "w-11" } as const;

function Slot({ size, children }: { size: RowSize; children?: ReactNode }) {
  return <span className={cn("flex shrink-0 items-center justify-center", COL[size])}>{children}</span>;
}

/**
 * One person: avatar, name, You / Host tags, then fixed columns, right-aligned so mic and remove
 * line up in every section.
 * Raised hands (`handColumns`): [hand badge] [lower hand (hosts)] [mic] [remove (hosts)]
 * In the call:                                                   [mic] [remove (hosts)]
 * Hosts get Mute in the mic column when the mic is on. A host's own row can lower their hand
 * but never mutes or removes themselves.
 */
export function PeopleRow({
  person,
  isSelf,
  isHost,
  handPosition,
  hostSend,
  onRemove,
  handColumns = false,
  size = "md"
}: {
  person: MeetingParticipantView;
  isSelf: boolean;
  isHost: boolean;
  handPosition?: number;
  /** Only the Raised hands list has the hand badge and Lower hand columns (they'd be empty elsewhere). */
  handColumns?: boolean;
  hostSend: (message: MeetingClientMessage, done: string) => void;
  onRemove: () => void;
  size?: RowSize;
}) {
  const p = person;
  const iconSize = size === "touch" ? "touch" : "md";
  return (
    <li className={cn("flex items-center gap-3 pl-4 pr-2", ROW[size])}>
      <Avatar name={p.name} size="sm" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm text-foreground">{p.name}</span>
        {isSelf ? <StatusTag size="sm">You</StatusTag> : null}
        {p.isHost ? <StatusTag size="sm">Host</StatusTag> : null}
      </div>
      <div className="flex shrink-0 items-center">
        {handColumns ? (
          <Slot size={size}>{handPosition ? <HandBadge position={handPosition} compact className="gap-0.5 px-1" /> : null}</Slot>
        ) : null}
        {handColumns && isHost ? (
          <Slot size={size}>
            {handPosition ? (
              <IconButton
                size={iconSize}
                label={`Lower ${p.name}'s hand`}
                onClick={() => hostSend({ t: "lowerHand", uid: p.uid }, `Lowered ${p.name}'s hand.`)}
              >
                <ArrowDown />
              </IconButton>
            ) : null}
          </Slot>
        ) : null}
        <Slot size={size}>
          {isHost && !isSelf && p.audioOn ? (
            <IconButton
              size={iconSize}
              label={`Mute ${p.name}`}
              onClick={() => hostSend({ t: "mute", uid: p.uid, kind: "audio" }, `Muted ${p.name}.`)}
            >
              <Mic />
            </IconButton>
          ) : (
            <span role="img" className="text-muted-foreground" aria-label={p.audioOn ? "Microphone on" : "Microphone off"}>
              {p.audioOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </span>
          )}
        </Slot>
        {isHost ? (
          <Slot size={size}>
            {!isSelf ? (
              <IconButton size={iconSize} tone="danger" label={`Remove ${p.name}`} onClick={onRemove}>
                <UserMinus />
              </IconButton>
            ) : null}
          </Slot>
        ) : null}
      </div>
    </li>
  );
}

/** Someone in the lobby: Deny (ghost) and Admit (the one primary when they're the only one). */
export function WaitingRow({
  person,
  single,
  size,
  onDeny,
  onAdmit
}: {
  person: MeetingWaitingView;
  single: boolean;
  size: RowSize;
  onDeny: () => void;
  onAdmit: () => void;
}) {
  const control = size === "touch" ? "h-11" : "h-8";
  return (
    <li className={cn("flex items-center gap-3 pl-4 pr-2", ROW[size])}>
      <Avatar name={person.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{person.name}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="ghost" className={control} onClick={onDeny}>
          Deny
        </Button>
        <Button
          size="sm"
          variant={single ? "default" : "outline"}
          className={cn(control, !single && "text-[var(--brand-green)]")}
          onClick={onAdmit}
        >
          Admit
        </Button>
      </span>
    </li>
  );
}
