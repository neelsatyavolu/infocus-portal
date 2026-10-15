"use client";

import { MicOff, MonitorUp, Pin, PinOff, ShieldAlert } from "lucide-react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import type { ReceiveQuality } from "@/src/lib/meetings/client/meet-settings";
import { ridForTileHeight } from "@/src/lib/meetings/client/quality";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { cn } from "@/src/lib/utils";
import { Avatar } from "./avatar";
import { HandBadge } from "./hand-badge";
import { OVERLAY_CHIP } from "./overlay";
import { VideoView, useDecryptFailing, usePulledTrack } from "./media-elements";
import { useDebouncedValue } from "./use-debounced-value";

const RID_DEBOUNCE_MS = 500;

export type TileModel = {
  id: string;
  participant: MeetingParticipantView;
  isSelf: boolean;
  isScreen: boolean;
};

/** `onDark`: notes on a screen tile, which stays dark like a video player in both themes. */
function CenterNote({ icon, onDark = false, children }: { icon: React.ReactNode; onDark?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm",
        onDark ? "text-[var(--soft-white)]/75" : "text-muted-foreground"
      )}
    >
      {icon}
      {children}
    </div>
  );
}

/**
 * Name pill, bottom-left: the call's overlay chip (fixed dark, Soft White) with the mic-off icon.
 * A raised hand shows once, as the numbered amber badge top-left.
 */
function NamePill({ label, micOff }: { label: string; micOff: boolean }) {
  return (
    <figcaption className={cn("absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 px-2 py-1 text-xs", OVERLAY_CHIP)}>
      {micOff ? <MicOff className="h-3.5 w-3.5 shrink-0" aria-label="Microphone off" /> : null}
      <span className="truncate">{label}</span>
    </figcaption>
  );
}

export function ParticipantTile({
  tile,
  partyTracks,
  e2ee,
  placement,
  tileHeight,
  receive,
  mirrorSelf = true,
  speaking,
  pinned,
  onTogglePin,
  selfTrack,
  small,
  handPosition
}: {
  tile: TileModel;
  partyTracks: PartyTracks | null;
  e2ee: MeetingE2ee | null;
  placement: "main" | "grid" | "strip";
  /** On-screen height (CSS px); picks the simulcast layer to pull. */
  tileHeight: number;
  receive: ReceiveQuality;
  mirrorSelf?: boolean;
  speaking: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  /** Local camera preview for the self tile. */
  selfTrack?: MediaStreamTrack;
  small?: boolean;
  /** Raised-hand queue position (1 = first). */
  handPosition?: number;
}) {
  const { participant, isSelf, isScreen } = tile;
  const wantsVideo = isScreen ? participant.screenOn : participant.videoOn;
  // A camera pull stays alive while the camera is off (the publisher sends a black placeholder),
  // so camera off/on doesn't renegotiate; a screen pull only while sharing.
  const meta = isSelf ? undefined : isScreen ? (participant.screenOn ? participant.tracks.screen : undefined) : participant.tracks.video;
  // Debounced so resizing the window doesn't thrash layer switches.
  const rid = useDebouncedValue(ridForTileHeight(tileHeight, receive, placement), RID_DEBOUNCE_MS);
  // Camera off: keep the pull at the smallest layer until it's back on.
  const remoteTrack = usePulledTrack(partyTracks, meta, isScreen ? undefined : wantsVideo ? rid : "q");
  const failing = useDecryptFailing(e2ee, remoteTrack);
  const track = isSelf ? (isScreen ? undefined : selfTrack) : remoteTrack;
  const label = isScreen ? `${participant.name} (presenting)` : isSelf ? `${participant.name} (You)` : participant.name;

  return (
    <figure
      aria-label={label}
      className={cn(
        // Camera tiles follow the theme; screens sit on dark like a video player (letterboxing).
        "group relative h-full w-full overflow-hidden rounded-md",
        isScreen ? "bg-[#0F110F]" : "bg-[var(--ink-2)]",
        // Outline, not border: the speaker ring never shifts the layout.
        // Speaking (green) wins over a raised hand (amber); the amber hand badge stays visible either way.
        speaking && !isScreen
          ? "outline outline-2 outline-[var(--brand-green)]"
          : handPosition
            ? "outline outline-2 outline-[#F2A516]"
            : "outline outline-1 outline-[var(--ink-4)]"
      )}
    >
      {failing ? (
        <CenterNote onDark={isScreen} icon={<ShieldAlert className={cn("h-5 w-5", isScreen ? "text-[#F2A516]" : "text-[var(--brand-amber)]")} aria-hidden />}>
          Can&rsquo;t decrypt this video yet
        </CenterNote>
      ) : isSelf && isScreen ? (
        <CenterNote onDark icon={<MonitorUp className="h-6 w-6" aria-hidden />}>
          You&rsquo;re presenting to everyone
        </CenterNote>
      ) : wantsVideo && track ? (
        <VideoView track={track} mirror={isSelf && mirrorSelf} contain={isScreen} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Avatar name={participant.name} size={small ? "md" : "lg"} />
        </div>
      )}

      {handPosition ? <HandBadge position={handPosition} compact={small} className="absolute left-2 top-2" /> : null}

      <NamePill label={label} micOff={!participant.audioOn && !isScreen} />

      <button
        type="button"
        onClick={onTogglePin}
        aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
        className={cn(
          "absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-[6px] transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
          // Touch screens have no hover: keep the pin reachable; hover devices reveal it on hover.
          pinned ? "opacity-100" : "opacity-70 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#0F110F]/60 text-[var(--soft-white)]">
          {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </span>
      </button>
    </figure>
  );
}

export function OverflowTile({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} more people. Open the people list.`}
      className="flex h-full w-full items-center justify-center rounded-md bg-[var(--ink-2)] font-mono text-2xl tabular-nums text-foreground outline outline-1 outline-[var(--ink-4)] hover:bg-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-[var(--brand-green)]"
    >
      +{count}
    </button>
  );
}
