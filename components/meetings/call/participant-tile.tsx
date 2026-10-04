"use client";

import { Hand, MicOff, MonitorUp, Pin, PinOff, ShieldAlert } from "lucide-react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import type { SimulcastRid } from "@/src/lib/meetings/client/layout";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { cn } from "@/src/lib/utils";
import { VideoView, useDecryptFailing, usePulledTrack } from "./media-elements";

export type TileModel = {
  id: string;
  participant: MeetingParticipantView;
  isSelf: boolean;
  isScreen: boolean;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-[var(--ink-4)] font-semibold text-foreground",
          small ? "h-10 w-10 text-sm" : "h-16 w-16 text-xl md:h-20 md:w-20 md:text-2xl"
        )}
        aria-hidden
      >
        {initials(name)}
      </span>
    </div>
  );
}

export function ParticipantTile({
  tile,
  partyTracks,
  e2ee,
  rid,
  speaking,
  pinned,
  onTogglePin,
  selfTrack,
  small,
  className
}: {
  tile: TileModel;
  partyTracks: PartyTracks | null;
  e2ee: MeetingE2ee | null;
  rid: SimulcastRid;
  speaking: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  /** Local camera preview for the self tile. */
  selfTrack?: MediaStreamTrack;
  small?: boolean;
  className?: string;
}) {
  const { participant, isSelf, isScreen } = tile;
  const wantsVideo = isScreen ? participant.screenOn : participant.videoOn;
  const meta = isSelf || !wantsVideo ? undefined : isScreen ? participant.tracks.screen : participant.tracks.video;
  const remoteTrack = usePulledTrack(partyTracks, meta, isScreen ? undefined : rid);
  const failing = useDecryptFailing(e2ee, remoteTrack);
  const track = isSelf ? (isScreen ? undefined : selfTrack) : remoteTrack;
  const label = isScreen ? `${participant.name} (presenting)` : isSelf ? `${participant.name} (You)` : participant.name;

  return (
    <figure
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-md border bg-[var(--ink-2)]",
        speaking && !isScreen ? "border-[var(--brand-green)] ring-2 ring-[var(--brand-green)]" : "border-[var(--ink-4)]",
        className
      )}
      aria-label={label}
    >
      {failing ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-[var(--brand-amber)]" aria-hidden />
          Can&rsquo;t decrypt this video yet
        </div>
      ) : isSelf && isScreen ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
          <MonitorUp className="h-6 w-6" aria-hidden />
          You&rsquo;re presenting to everyone
        </div>
      ) : wantsVideo && track ? (
        <VideoView track={track} mirror={isSelf} contain={isScreen} />
      ) : (
        <Avatar name={participant.name} small={small} />
      )}

      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/55 px-2 py-1 text-xs text-soft-white">
        {!participant.audioOn && !isScreen ? (
          <MicOff className="h-3.5 w-3.5 shrink-0" aria-label="Microphone off" />
        ) : null}
        <span className="truncate">{label}</span>
      </figcaption>

      {participant.handRaisedAt !== null && !isScreen ? (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
          <Hand className="h-3.5 w-3.5" aria-hidden /> Hand raised
        </span>
      ) : null}

      <button
        type="button"
        onClick={onTogglePin}
        aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
        className={cn(
          "absolute right-2 top-2 rounded-md bg-[var(--ink-2)]/90 p-1.5 text-foreground transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
          pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
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
      className="flex h-full w-full items-center justify-center rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] font-mono text-2xl tabular-nums text-foreground hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
    >
      +{count}
    </button>
  );
}
