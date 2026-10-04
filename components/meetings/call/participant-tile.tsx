"use client";

import { Hand, MicOff, MonitorUp, Pin, PinOff, ShieldAlert } from "lucide-react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import type { SimulcastRid } from "@/src/lib/meetings/client/layout";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { cn } from "@/src/lib/utils";
import { Avatar } from "./avatar";
import { VideoView, useDecryptFailing, usePulledTrack } from "./media-elements";

export type TileModel = {
  id: string;
  participant: MeetingParticipantView;
  isSelf: boolean;
  isScreen: boolean;
};

function CenterNote({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

/** Name pill, bottom-left: translucent dark with Soft White text, mic-off and hand icons beside it. */
function NamePill({ label, micOff, hand }: { label: string; micOff: boolean; hand: boolean }) {
  return (
    <figcaption className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-[4px] bg-[#0F110F]/60 px-2.5 py-1 text-xs text-[var(--soft-white)]">
      {micOff ? <MicOff className="h-3.5 w-3.5 shrink-0" aria-label="Microphone off" /> : null}
      {hand ? <Hand className="h-3.5 w-3.5 shrink-0 text-[var(--brand-green)]" aria-label="Hand raised" /> : null}
      <span className="truncate">{label}</span>
    </figcaption>
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
  small
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
      aria-label={label}
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-md bg-[var(--ink-2)]",
        // Outline, not border: the speaker ring never shifts the layout.
        speaking && !isScreen ? "outline outline-2 outline-[var(--brand-green)]" : "outline outline-1 outline-[var(--ink-4)]"
      )}
    >
      {failing ? (
        <CenterNote icon={<ShieldAlert className="h-5 w-5 text-[var(--brand-amber)]" aria-hidden />}>
          Can&rsquo;t decrypt this video yet
        </CenterNote>
      ) : isSelf && isScreen ? (
        <CenterNote icon={<MonitorUp className="h-6 w-6" aria-hidden />}>You&rsquo;re presenting to everyone</CenterNote>
      ) : wantsVideo && track ? (
        <VideoView track={track} mirror={isSelf} contain={isScreen} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Avatar name={participant.name} size={small ? "md" : "lg"} />
        </div>
      )}

      <NamePill
        label={label}
        micOff={!participant.audioOn && !isScreen}
        hand={participant.handRaisedAt !== null && !isScreen}
      />

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
