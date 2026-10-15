"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ListChecks, Loader2, Lock, Mic, MicOff, ShieldCheck, Video, VideoOff } from "lucide-react";
import { NEVER } from "rxjs";
import { useObservableAsValue } from "partytracks/react";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { cn } from "@/src/lib/utils";
import { pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { Avatar } from "./avatar";
import { CallButton } from "./call-button";
import { DevicePopover } from "./device-popover";
import { useMeetEmbedded } from "./embed-context";
import { OVERLAY_CHIP } from "./overlay";
import { shouldMonitorMic, micTestLabel } from "@/src/lib/meetings/client/mic-monitor";
import { LevelMeter } from "./level-meter";
import { VideoView, useObservableTrack } from "./media-elements";
import { accessTagLabel } from "../tab/meeting-rows";
import { PREJOIN_AREA, PREJOIN_CONTAINER, PREJOIN_GRID } from "./prejoin-layout";
import { PreJoinBar } from "./top-bar";
import type { LocalMedia } from "./use-local-media";

function Preview({ media, userName }: { media: LocalMedia; userName: string }) {
  const camera$ = useMemo(() => (media.videoOn ? media.camera.localMonitorTrack$ : NEVER), [media.videoOn, media.camera]);
  // Pre-join always monitors the mic (processed, voice-isolated track) so it can be tested muted.
  const monitorMic = shouldMonitorMic({ screen: "prejoin", settingsOpen: false, audioOn: media.audioOn });
  const mic$ = useMemo(() => (monitorMic ? media.mic.localMonitorTrack$ : NEVER), [monitorMic, media.mic]);
  const cameraTrack = useObservableTrack(camera$);
  const micTrack = useObservableTrack(mic$);
  const showVideo = media.videoOn && cameraTrack;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[var(--ink-2)] outline outline-1 outline-[var(--ink-4)]">
      {showVideo ? (
        <VideoView track={cameraTrack} mirror={media.settings.mirror} />
      ) : (
        // pb-16 keeps the avatar and caption above the 48px controls at bottom-3 (they met on phones).
        <div className="flex h-full flex-col items-center justify-center gap-3 pb-16">
          <Avatar name={userName} size="lg" />
          <span className="text-sm text-muted-foreground">{media.videoOn ? "Starting camera…" : "Camera is off"}</span>
        </div>
      )}

      {micTrack ? (
        <div title={micTestLabel(media.audioOn)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#0F110F]/60">
          <LevelMeter track={micTrack} compact />
        </div>
      ) : null}

      {/* Top-left, across from the level meter: the bottom edge belongs to the controls. */}
      <span className={cn("absolute left-3 top-3 hidden max-w-[calc(100%-5rem)] truncate px-2 py-1 text-xs sm:block", OVERLAY_CHIP)}>
        {userName}
      </span>

      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
        <CallButton surface="video" label={media.audioOn ? "Turn off microphone" : "Turn on microphone"} state={media.audioOn ? "on" : "off"} onClick={media.toggleAudio}>
          {media.audioOn ? <Mic /> : <MicOff />}
        </CallButton>
        <CallButton surface="video" label={media.videoOn ? "Turn off camera" : "Turn on camera"} state={media.videoOn ? "on" : "off"} onClick={media.toggleVideo}>
          {media.videoOn ? <Video /> : <VideoOff />}
        </CallButton>
        <DevicePopover media={media} micTrack={micTrack} />
      </div>
    </div>
  );
}

const STATUS_TAG: Partial<Record<MeetingDetail["status"], { tone: "live" | "neutral" | "danger"; label: string }>> = {
  LIVE: { tone: "live", label: "Live now" },
  ENDED: { tone: "neutral", label: "Ended" },
  CANCELED: { tone: "danger", label: "Cancelled" }
};

/** "9:10–9:40 PM" when the meeting has a length, else the start time alone. */
function timeRange(meeting: MeetingDetail) {
  const start = pacificTimeLabel(meeting.startsAt);
  if (!meeting.durationMinutes) return start;
  const end = pacificTimeLabel(new Date(Date.parse(meeting.startsAt) + meeting.durationMinutes * 60_000));
  return `${start}–${end}`;
}

/** The meeting's nameplate: eyebrow and status on one row, title, when, and the facts as tags. */
function MeetingPlate({ meeting }: { meeting: MeetingDetail }) {
  const status = STATUS_TAG[meeting.status];
  const access = accessTagLabel(meeting);
  const hasMeta = Boolean(access) || meeting.notesEnabled || meeting.agendaCount > 0;
  return (
    <header className={cn("brand-hero-panel p-4 md:p-5", PREJOIN_AREA.head)}>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="eyebrow">{meeting.seriesKey === "producers" ? "InFocus Producer Meeting" : "Meeting"}</p>
        {status ? <StatusTag tone={status.tone}>{status.label}</StatusTag> : null}
      </div>
      <h1 className="display-sm mt-2 text-foreground">{meeting.title}</h1>
      <p className="mt-1.5 text-sm text-[var(--ink-text)]">
        {pacificDayLabel(meeting.startsAt)} · {timeRange(meeting)} Pacific
      </p>
      {hasMeta ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {access ? <StatusTag icon={meeting.access === "EXECS_ONLY" ? ShieldCheck : Lock}>{access}</StatusTag> : null}
          {/* The same recording tag as in the call's status bar. */}
          {meeting.notesEnabled ? <StatusTag tone="live">Notes on</StatusTag> : null}
          {meeting.agendaCount > 0 ? (
            <StatusTag icon={ListChecks}>{`Agenda · ${meeting.agendaCount} ${meeting.agendaCount === 1 ? "item" : "items"}`}</StatusTag>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function joinPath(meeting: MeetingDetail) {
  if (meeting.isHost) return "You're a host, so you go straight in.";
  if (meeting.quickAccess) return "Quick access is on, so you go straight in.";
  return "A host will let you in.";
}

/**
 * Bar, then one container (max 1080px, the bar's container too). Phones stack: nameplate,
 * preview, actions. From 768px the preview sits left (3fr) and the nameplate and actions right
 * (2fr), their tops aligned. The single encryption note before the call is under Join.
 */
export function PreJoin({
  meeting,
  userName,
  media,
  joining,
  onJoin
}: {
  meeting: MeetingDetail;
  userName: string;
  media: LocalMedia;
  joining: boolean;
  onJoin: () => void;
}) {
  const embedded = useMeetEmbedded();
  const micPermission = useObservableAsValue(media.mic.permissionState$, "unknown");
  const cameraPermission = useObservableAsValue(media.camera.permissionState$, "unknown");
  const neverAllowed = micPermission !== "granted" && cameraPermission !== "granted";
  const over = meeting.status === "ENDED" || meeting.status === "CANCELED";
  const directJoin = meeting.isHost || meeting.quickAccess;
  const hint =
    neverAllowed && !media.audioOn && !media.videoOn
      ? "Turn on your camera or mic to test them."
      : micPermission === "granted" && !media.audioOn
        ? micTestLabel(false)
        : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ink)]">
      <PreJoinBar userName={userName} />
      <main className="flex flex-1 flex-col py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:justify-center md:py-10">
        <div className={cn(PREJOIN_CONTAINER, PREJOIN_GRID)}>
          <MeetingPlate meeting={meeting} />

          <section aria-label="Preview" className={cn("space-y-3", PREJOIN_AREA.preview)}>
            <Preview media={media} userName={userName} />
            {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
          </section>

          <section aria-label="Join" className={cn("space-y-3", PREJOIN_AREA.actions)}>
            {over ? (
              <p className="text-sm text-[var(--ink-text)]">This meeting {meeting.status === "ENDED" ? "has ended" : "was cancelled"}.</p>
            ) : (
              <div className="space-y-2">
                <Button className="h-11 w-full" onClick={onJoin} disabled={joining}>
                  {joining ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {directJoin ? "Join now" : "Ask to join"}
                </Button>
                <p className="text-[13px] text-muted-foreground">{joinPath(meeting)}</p>
              </div>
            )}
            {!embedded ? (
              <Link href={"/meetings" as never} className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}>
                Back to Meetings
              </Link>
            ) : null}
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Encrypted on your device. Only people in the meeting can see and hear it.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
