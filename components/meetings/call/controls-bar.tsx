"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Clapperboard,
  Eye,
  EyeOff,
  Hand,
  Info,
  ListChecks,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  MoreVertical,
  PhoneOff,
  Settings,
  ShieldCheck,
  SmilePlus,
  Users,
  Video,
  VideoOff
} from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { MEETING_REACTIONS, type MeetingReaction } from "@/src/lib/meetings/protocol";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { ordinal } from "@/src/lib/meetings/client/hands";
import { cn } from "@/src/lib/utils";
import { CallButton, LeaveButton, PanelToggle } from "./call-button";
import { CallCount } from "./call-count";
import { MENU_SURFACE } from "./menu-row";
import { MoreMenu, type MoreRowItem, type MoreTile } from "./more-menu";
import type { CallPanelId } from "./panel-tabs";
import { ShareMenu } from "./share-menu";
import { CALL_SHORTCUTS, shortcutLabel } from "./shortcut";

/** desktop: one 72px bar. phone: a 64px bar of six. rail: phone on its side, the six in the 72px right-hand column. */
export type ControlsForm = "desktop" | "phone" | "rail";

export type ControlsProps = {
  form: ControlsForm;
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
  panel: CallPanelId | null;
  /** Agenda items not yet checked off. */
  agendaRemaining: number;
  unread: number;
  peopleCount: number;
  /** People in the lobby; 0 for non-hosts. */
  waitingCount: number;
  isHost: boolean;
  selfHidden: boolean;
  layout: LayoutMode;
  layoutAlone: boolean;
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
  onDetails: () => void;
  onHostSettings: () => void;
  onDevices: () => void;
  onToggleSelf: () => void;
  onLeave: () => void;
};

/** Desktop React: stays open after a pick, so several reactions go out quickly. */
function ReactionPicker({ onReact }: { onReact: (emoji: MeetingReaction) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <CallButton label="Send a reaction">
          <SmilePlus />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content onOpenAutoFocus={pointerSafeAutoFocus} side="top" sideOffset={12} className={cn(MENU_SURFACE, "flex gap-1 p-1")}>
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

/** Badge words; buttons add them to their accessible name (srDetail). */
function waitingText(count: number) {
  return count > 0 ? `${count} waiting to join` : undefined;
}

function unreadText(count: number) {
  return count > 0 ? `${count} unread` : undefined;
}

function waitingBadge(count: number) {
  return count > 0 ? <CallCount count={count} tone="warn" srLabel={waitingText(count)} /> : undefined;
}

function unreadBadge(count: number) {
  return count > 0 ? <CallCount count={count} tone="brand" srLabel={unreadText(count)} /> : undefined;
}

/** Mic, camera and hand: the same three plates in every form. */
function MediaButtons({ props, compact, side }: { props: ControlsProps; compact: boolean; side: "top" | "left" }) {
  return (
    <>
      <CallButton
        compact={compact}
        tooltipSide={side}
        label={props.audioOn ? "Turn off microphone" : "Turn on microphone"}
        shortcut={shortcutLabel(CALL_SHORTCUTS.mic)}
        state={props.audioOn ? "on" : "off"}
        onClick={props.onMic}
        onPointerEnter={props.onMicIntent}
        onFocus={props.onMicIntent}
      >
        {props.audioOn ? <Mic /> : <MicOff />}
      </CallButton>
      <CallButton
        compact={compact}
        tooltipSide={side}
        label={props.videoOn ? "Turn off camera" : "Turn on camera"}
        shortcut={shortcutLabel(CALL_SHORTCUTS.camera)}
        state={props.videoOn ? "on" : "off"}
        onClick={props.onCamera}
      >
        {props.videoOn ? <Video /> : <VideoOff />}
      </CallButton>
    </>
  );
}

function HandButton({ props, compact, side }: { props: ControlsProps; compact: boolean; side: "top" | "left" }) {
  return (
    <CallButton
      compact={compact}
      tooltipSide={side}
      label={handLabel(props.handRaised, props.handPosition)}
      shortcut={shortcutLabel(CALL_SHORTCUTS.hand)}
      state={props.handRaised ? "active" : "on"}
      onClick={props.onHand}
    >
      <Hand />
    </CallButton>
  );
}

function phoneTiles(props: ControlsProps): MoreTile[] {
  const tiles: Array<MoreTile | null> = [
    {
      id: "people",
      label: "People",
      icon: <Users />,
      onSelect: props.onPeople,
      badge: (
        <>
          <CallCount count={props.peopleCount} tone="neutral" srLabel={`${props.peopleCount} in the call`} />
          {waitingBadge(props.waitingCount)}
        </>
      )
    },
    {
      id: "agenda",
      label: "Agenda",
      icon: <ListChecks />,
      onSelect: props.onAgenda,
      badge: props.agendaRemaining ? <CallCount count={props.agendaRemaining} tone="neutral" srLabel={`${props.agendaRemaining} left`} /> : undefined
    },
    props.canShare
      ? {
          id: "share",
          label: props.sharing ? "Stop presenting" : "Share screen",
          icon: props.sharing ? <MonitorX /> : <MonitorUp />,
          onSelect: props.onShare,
          badge: props.sharing ? (
            <StatusTag tone="success" size="sm">
              On
            </StatusTag>
          ) : undefined
        }
      : null,
    { id: "watch", label: "Watch a package cut", icon: <Clapperboard />, onSelect: props.onWatch },
    { id: "details", label: "Meeting details", icon: <Info />, onSelect: props.onDetails },
    props.isHost ? { id: "host", label: "Host settings", icon: <ShieldCheck />, onSelect: props.onHostSettings } : null,
    { id: "devices", label: "Audio and video settings", icon: <Settings />, onSelect: props.onDevices },
    {
      id: "self",
      label: props.selfHidden ? "Show self view" : "Hide self view",
      icon: props.selfHidden ? <Eye /> : <EyeOff />,
      onSelect: props.onToggleSelf
    }
  ];
  return tiles.filter((tile): tile is MoreTile => tile !== null);
}

/** Desktop More, under Layout: one short group of rows (no labels for single rows). */
function desktopRows(props: ControlsProps): MoreRowItem[] {
  return [
    {
      id: "self",
      label: props.selfHidden ? "Show self view" : "Hide self view",
      icon: props.selfHidden ? <Eye /> : <EyeOff />,
      onSelect: props.onToggleSelf
    },
    { id: "devices", label: "Audio and video settings", icon: <Settings />, onSelect: props.onDevices },
    { id: "details", label: "Meeting details", icon: <Info />, onSelect: props.onDetails },
    ...(props.isHost ? [{ id: "host", label: "Host settings", icon: <ShieldCheck />, onSelect: props.onHostSettings }] : [])
  ];
}

function PhoneControls({ props, side, moreOpen, setMoreOpen }: { props: ControlsProps; side: "top" | "left"; moreOpen: boolean; setMoreOpen: (open: boolean) => void }) {
  return (
    <>
      <MediaButtons props={props} compact side={side} />
      <HandButton props={props} compact side={side} />
      <CallButton
        compact
        tooltipSide={side}
        label="Chat"
        badge={unreadBadge(props.unread)}
        srDetail={unreadText(props.unread)}
        onClick={props.onChat}
      >
        <MessageSquare />
      </CallButton>
      <MoreMenu
        open={moreOpen}
        onOpenChange={setMoreOpen}
        mobile
        tiles={phoneTiles(props)}
        layout={props.layout}
        onLayout={props.onLayout}
        layoutAlone={props.layoutAlone}
        onReact={props.onReact}
        trigger={
          <CallButton
            compact
            tooltipSide={side}
            label="More options"
            badge={waitingBadge(props.waitingCount)}
            srDetail={waitingText(props.waitingCount)}
          >
            <MoreVertical />
          </CallButton>
        }
      />
      <LeaveButton compact tooltipSide={side} label="Leave call" onClick={props.onLeave}>
        <PhoneOff />
      </LeaveButton>
    </>
  );
}

/**
 * Desktop (72px, grid-like): an empty left cell so the media controls are truly centered from
 * 1024px | mic cam share hand react more · leave | the People / Chat / Agenda panel toggles.
 * Phones: six equal 44px plates (mic, camera, hand, chat, more, leave); on their side, the same
 * six in CallRoom's right-hand rail column, under the time and status tags.
 */
export function ControlsBar(props: ControlsProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (props.form === "rail") {
    // Never shrinks: the status above it gives way first, so Leave is always on screen.
    return (
      <nav aria-label="Call controls" className="flex flex-1 shrink-0 flex-col items-center justify-center gap-1">
        <PhoneControls props={props} side="left" moreOpen={moreOpen} setMoreOpen={setMoreOpen} />
      </nav>
    );
  }

  if (props.form === "phone") {
    return (
      <nav
        aria-label="Call controls"
        className="shrink-0 border-t border-[var(--ink-4)] bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      >
        <div className="mx-auto grid h-16 max-w-sm grid-cols-6 place-items-center">
          <PhoneControls props={props} side="top" moreOpen={moreOpen} setMoreOpen={setMoreOpen} />
        </div>
      </nav>
    );
  }

  const open = props.panel;
  return (
    <nav
      aria-label="Call controls"
      className="shrink-0 border-t border-[var(--ink-4)] bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]"
    >
      <div className="flex h-[72px] items-center gap-4">
        <div aria-hidden className="hidden min-w-0 flex-1 lg:block" />
        <div className="flex flex-1 items-center justify-center gap-2 lg:flex-none">
          <MediaButtons props={props} compact={false} side="top" />
          <ShareMenu
            canShare={props.canShare}
            sharing={props.sharing}
            shareSound={props.shareSound}
            onShareSound={props.onShareSound}
            onShare={props.onShare}
            onWatch={props.onWatch}
          />
          <HandButton props={props} compact={false} side="top" />
          <ReactionPicker onReact={props.onReact} />
          <MoreMenu
            open={moreOpen}
            onOpenChange={setMoreOpen}
            mobile={false}
            rows={desktopRows(props)}
            layout={props.layout}
            onLayout={props.onLayout}
            layoutAlone={props.layoutAlone}
            trigger={
              <CallButton label="More options">
                <MoreVertical />
              </CallButton>
            }
          />
          <LeaveButton label="Leave call" className="ml-1" onClick={props.onLeave}>
            <PhoneOff />
            <span>Leave</span>
          </LeaveButton>
        </div>
        <div role="group" aria-label="Panels" className="flex items-center justify-end gap-1.5 lg:flex-1">
          <PanelToggle
            label={`People (${props.peopleCount})`}
            open={open === "people"}
            count={props.peopleCount}
            badge={waitingBadge(props.waitingCount)}
            srDetail={waitingText(props.waitingCount)}
            onClick={props.onPeople}
          >
            <Users />
          </PanelToggle>
          <PanelToggle
            label="Chat"
            shortcut={shortcutLabel(CALL_SHORTCUTS.chat)}
            open={open === "chat"}
            badge={unreadBadge(props.unread)}
            srDetail={unreadText(props.unread)}
            onClick={props.onChat}
          >
            <MessageSquare />
          </PanelToggle>
          <PanelToggle
            label={props.agendaRemaining ? `Agenda (${props.agendaRemaining} left)` : "Agenda"}
            open={open === "agenda"}
            count={props.agendaRemaining || undefined}
            onClick={props.onAgenda}
          >
            <ListChecks />
          </PanelToggle>
        </div>
      </div>
    </nav>
  );
}
