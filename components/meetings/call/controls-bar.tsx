"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Clapperboard,
  Hand,
  Info,
  ListChecks,
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
import { ordinal } from "@/src/lib/meetings/client/hands";
import { pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { CallButton, IconButton, LeaveButton } from "./call-button";
import { MoreMenu, type MoreAction } from "./more-menu";
import { ShareMenu } from "./share-menu";

export type ControlsProps = {
  mobile: boolean;
  title: string;
  audioOn: boolean;
  videoOn: boolean;
  sharing: boolean;
  /** False where getDisplayMedia is missing (iOS): screen sharing is left out (watch together stays). */
  canShare: boolean;
  /** Ask for the shared tab or screen's sound. */
  shareSound: boolean;
  handRaised: boolean;
  /** Our own raised-hand queue position, once the room has it. */
  handPosition?: number;
  chatOpen: boolean;
  peopleOpen: boolean;
  agendaOpen: boolean;
  /** Agenda items not yet checked off (badge). */
  agendaRemaining: number;
  unread: number;
  peopleCount: number;
  waitingCount: number;
  layout: LayoutMode;
  layoutAlone: boolean;
  moreActions: MoreAction[];
  onLayout: (mode: LayoutMode) => void;
  onMic: () => void;
  /** Hover/focus on the mic button: pre-warm the mic before an unmute. */
  onMicIntent: () => void;
  onCamera: () => void;
  onShare: () => void;
  onShareSound: (on: boolean) => void;
  /** Open the watch-together picker. */
  onWatch: () => void;
  onHand: () => void;
  onReact: (emoji: MeetingReaction) => void;
  onChat: () => void;
  onPeople: () => void;
  onAgenda: () => void;
  onInfo: () => void;
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
        <Popover.Content onOpenAutoFocus={pointerSafeAutoFocus} side="top" sideOffset={12} className="z-50 outline-none flex gap-1 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-1">
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

function handLabel(raised: boolean, position: number | undefined) {
  if (!raised) return "Raise hand";
  return position ? `Hand raised · ${ordinal(position)}. Lower hand` : "Lower hand";
}

/** Desktop left group: wall-clock time | meeting title. */
function ClockAndTitle({ title }: { title: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex min-w-0 items-center gap-3 text-sm">
      <span className="font-mono text-[13px] tabular-nums text-foreground">{pacificTimeLabel(now)}</span>
      <span className="h-4 w-px bg-[var(--ink-4)]" aria-hidden />
      <span className="truncate text-[var(--ink-text)]">{title}</span>
    </div>
  );
}

/**
 * 72px bar. Desktop: three groups on one line (grid 1fr | auto | 1fr) so the center group is
 * truly centered: clock + title | mic cam share hand react more leave | chat people info.
 * Phones: only mic, camera, hand, more and leave; the rest is in the more sheet.
 */
export function ControlsBar(props: ControlsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { mobile } = props;
  const hostBadge = props.waitingCount > 0 ? props.waitingCount : undefined;

  const shareAction: MoreAction[] = props.canShare
    ? [{ id: "share", label: props.sharing ? "Stop presenting" : "Share screen", icon: <MonitorUp />, onSelect: props.onShare }]
    : [];
  const mobileExtras: MoreAction[] = mobile
    ? [
        { id: "chat", label: "Chat", icon: <MessageSquare />, onSelect: props.onChat, badge: props.unread },
        { id: "people", label: `People (${props.peopleCount})`, icon: <Users />, onSelect: props.onPeople, badge: hostBadge },
        { id: "agenda", label: "Agenda", icon: <ListChecks />, onSelect: props.onAgenda, badge: props.agendaRemaining },
        ...shareAction,
        { id: "watch", label: "Watch a package cut", icon: <Clapperboard />, onSelect: props.onWatch },
        { id: "info", label: "Meeting info", icon: <Info />, onSelect: props.onInfo }
      ]
    : [];

  return (
    <nav
      aria-label="Call controls"
      className="shrink-0 border-t border-[var(--ink-4)] bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-6 md:pr-6"
    >
      <div className="grid h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
        <div className="min-w-0">{!mobile ? <ClockAndTitle title={props.title} /> : null}</div>

        <div className="flex items-center gap-2 sm:gap-3">
          <CallButton label={props.audioOn ? "Turn off microphone" : "Turn on microphone"} shortcut="⌘D" state={props.audioOn ? "on" : "off"} onClick={props.onMic} onPointerEnter={props.onMicIntent} onFocus={props.onMicIntent}>
            {props.audioOn ? <Mic /> : <MicOff />}
          </CallButton>
          <CallButton label={props.videoOn ? "Turn off camera" : "Turn on camera"} shortcut="⌘E" state={props.videoOn ? "on" : "off"} onClick={props.onCamera}>
            {props.videoOn ? <Video /> : <VideoOff />}
          </CallButton>
          {!mobile ? (
            <ShareMenu
              canShare={props.canShare}
              sharing={props.sharing}
              shareSound={props.shareSound}
              onShareSound={props.onShareSound}
              onShare={props.onShare}
              onWatch={props.onWatch}
            />
          ) : null}
          <CallButton label={handLabel(props.handRaised, props.handPosition)} shortcut="⌘⌥H" state={props.handRaised ? "active" : "on"} onClick={props.onHand}>
            <Hand />
          </CallButton>
          {!mobile ? <ReactionPicker onReact={props.onReact} /> : null}
          <MoreMenu
            open={moreOpen}
            onOpenChange={setMoreOpen}
            mobile={mobile}
            actions={[...mobileExtras, ...props.moreActions]}
            layout={props.layout}
            onLayout={props.onLayout}
            layoutAlone={props.layoutAlone}
            onReact={mobile ? props.onReact : undefined}
            trigger={
              <CallButton label="More options" badge={mobile ? props.unread || hostBadge : undefined}>
                <MoreVertical />
              </CallButton>
            }
          />
          <LeaveButton label="Leave call" compact={mobile} onClick={props.onLeave}>
            <PhoneOff />
            {!mobile ? <span>Leave</span> : null}
          </LeaveButton>
        </div>

        <div className="flex items-center justify-end gap-1">
          {!mobile ? (
            <>
              <IconButton label="Chat" shortcut="⌘⌥C" badge={props.unread || undefined} onClick={props.onChat} className={props.chatOpen ? "bg-[var(--ink-3)] text-foreground" : undefined}>
                <MessageSquare />
              </IconButton>
              <IconButton label={`People (${props.peopleCount})`} badge={hostBadge ?? props.peopleCount} onClick={props.onPeople} className={props.peopleOpen ? "bg-[var(--ink-3)] text-foreground" : undefined}>
                <Users />
              </IconButton>
              <IconButton
                label={props.agendaRemaining ? `Agenda (${props.agendaRemaining} left)` : "Agenda"}
                badge={props.agendaRemaining || undefined}
                onClick={props.onAgenda}
                className={props.agendaOpen ? "bg-[var(--ink-3)] text-foreground" : undefined}
              >
                <ListChecks />
              </IconButton>
              <IconButton label="Meeting info" onClick={props.onInfo}>
                <Info />
              </IconButton>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
