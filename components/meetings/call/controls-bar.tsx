"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreVertical,
  PhoneOff,
  SmilePlus,
  Users,
  Video,
  VideoOff
} from "lucide-react";
import { MEETING_REACTIONS, type MeetingReaction } from "@/src/lib/meetings/protocol";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { CallButton } from "./call-button";
import { MoreMenu, type MoreAction } from "./more-menu";

export type ControlsProps = {
  mobile: boolean;
  audioOn: boolean;
  videoOn: boolean;
  sharing: boolean;
  /** False where getDisplayMedia is missing (iOS): the share control is hidden. */
  canShare: boolean;
  handRaised: boolean;
  chatOpen: boolean;
  peopleOpen: boolean;
  unread: number;
  peopleCount: number;
  waitingCount: number;
  layout: LayoutMode;
  moreActions: MoreAction[];
  onLayout: (mode: LayoutMode) => void;
  onMic: () => void;
  onCamera: () => void;
  onShare: () => void;
  onHand: () => void;
  onReact: (emoji: MeetingReaction) => void;
  onChat: () => void;
  onPeople: () => void;
  onLeave: () => void;
};

function ReactionPicker({ onReact }: { onReact: (emoji: MeetingReaction) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <CallButton label="Send a reaction">
          <SmilePlus />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={8} className="z-50 flex gap-1 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-1.5">
          {MEETING_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              aria-label={`React ${emoji}`}
              className="flex h-11 w-11 items-center justify-center rounded-md text-2xl leading-none hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
            >
              {emoji}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ControlsBar(props: ControlsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { mobile } = props;
  const hostBadge = props.waitingCount > 0 ? props.waitingCount : undefined;

  const shareAction: MoreAction[] = props.canShare
    ? [{ id: "share", label: props.sharing ? "Stop presenting" : "Share screen", icon: <MonitorUp />, onSelect: props.onShare }]
    : [];
  // Phones keep mic, camera, hand, more and leave in the bar; everything else lives in the sheet.
  const mobileExtras: MoreAction[] = mobile
    ? [
        { id: "chat", label: "Chat", icon: <MessageSquare />, onSelect: props.onChat, badge: props.unread },
        { id: "people", label: `People (${props.peopleCount})`, icon: <Users />, onSelect: props.onPeople, badge: hostBadge },
        ...shareAction
      ]
    : [];

  const more = (
    <CallButton label="More options" badge={mobile ? (props.unread || hostBadge) : undefined}>
      <MoreVertical />
    </CallButton>
  );

  return (
    <nav
      aria-label="Call controls"
      className="flex items-center justify-center gap-2 border-t border-[var(--ink-4)] bg-[var(--ink)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <CallButton label={props.audioOn ? "Turn off microphone (⌘D)" : "Turn on microphone (⌘D)"} off={!props.audioOn} onClick={props.onMic}>
        {props.audioOn ? <Mic /> : <MicOff />}
      </CallButton>
      <CallButton label={props.videoOn ? "Turn off camera (⌘E)" : "Turn on camera (⌘E)"} off={!props.videoOn} onClick={props.onCamera}>
        {props.videoOn ? <Video /> : <VideoOff />}
      </CallButton>
      {!mobile && props.canShare ? (
        <CallButton label={props.sharing ? "Stop presenting" : "Share screen"} active={props.sharing} onClick={props.onShare}>
          <MonitorUp />
        </CallButton>
      ) : null}
      <CallButton label={props.handRaised ? "Lower hand (⌘⌥H)" : "Raise hand (⌘⌥H)"} active={props.handRaised} onClick={props.onHand}>
        <Hand />
      </CallButton>
      {!mobile ? <ReactionPicker onReact={props.onReact} /> : null}
      <MoreMenu
        open={moreOpen}
        onOpenChange={setMoreOpen}
        trigger={more}
        mobile={mobile}
        actions={[...mobileExtras, ...props.moreActions]}
        layout={props.layout}
        onLayout={props.onLayout}
        onReact={mobile ? props.onReact : undefined}
      />
      {!mobile ? (
        <span className="mx-1 flex gap-2 border-l border-[var(--ink-4)] pl-3">
          <CallButton label="Chat (⌘⌥C)" active={props.chatOpen} badge={props.unread || undefined} onClick={props.onChat}>
            <MessageSquare />
          </CallButton>
          <CallButton label="People" active={props.peopleOpen} badge={hostBadge} onClick={props.onPeople}>
            <Users />
            <span className="font-mono text-xs tabular-nums">{props.peopleCount}</span>
          </CallButton>
        </span>
      ) : null}
      <CallButton label="Leave call" tone="danger" onClick={props.onLeave}>
        <PhoneOff />
        {!mobile ? <span>Leave</span> : null}
      </CallButton>
    </nav>
  );
}
