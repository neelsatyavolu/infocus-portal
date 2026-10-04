"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Loader2, Lock, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { NEVER } from "rxjs";
import { useObservableAsValue } from "partytracks/react";
import { Button } from "@/components/ui/button";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { Avatar } from "./avatar";
import { CallButton } from "./call-button";
import { DevicePopover } from "./device-popover";
import { useMeetEmbedded } from "./embed-context";
import { LevelMeter } from "./level-meter";
import { VideoView, useObservableTrack } from "./media-elements";
import { PreJoinBar } from "./top-bar";
import type { LocalMedia } from "./use-local-media";

function Preview({ media, userName }: { media: LocalMedia; userName: string }) {
  const camera$ = useMemo(() => (media.videoOn ? media.camera.localMonitorTrack$ : NEVER), [media.videoOn, media.camera]);
  const mic$ = useMemo(() => (media.audioOn ? media.mic.localMonitorTrack$ : NEVER), [media.audioOn, media.mic]);
  const cameraTrack = useObservableTrack(camera$);
  const micTrack = useObservableTrack(mic$);
  const showVideo = media.videoOn && cameraTrack;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[var(--ink-2)] outline outline-1 outline-[var(--ink-4)]">
      {showVideo ? (
        <VideoView track={cameraTrack} mirror={media.settings.mirror} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Avatar name={userName} size="lg" />
          <span className="text-sm text-muted-foreground">{media.videoOn ? "Starting camera…" : "Camera is off"}</span>
        </div>
      )}

      {media.audioOn ? (
        <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#0F110F]/60">
          <LevelMeter track={micTrack} compact />
        </div>
      ) : null}

      <span className="absolute bottom-3 left-3 hidden max-w-[30%] truncate rounded-[4px] bg-[#0F110F]/60 px-2.5 py-1 text-xs text-[var(--soft-white)] sm:block">
        {userName}
      </span>

      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
        <CallButton label={media.audioOn ? "Turn off microphone" : "Turn on microphone"} state={media.audioOn ? "on" : "off"} onClick={media.toggleAudio}>
          {media.audioOn ? <Mic /> : <MicOff />}
        </CallButton>
        <CallButton label={media.videoOn ? "Turn off camera" : "Turn on camera"} state={media.videoOn ? "on" : "off"} onClick={media.toggleVideo}>
          {media.videoOn ? <Video /> : <VideoOff />}
        </CallButton>
        <DevicePopover media={media} micTrack={micTrack} />
      </div>
    </div>
  );
}

/**
 * Layout: a 56px bar, then one centered row (max 1080px) whose two columns are vertically
 * centered together (items-center); the row itself is centered in the remaining height.
 * Narrow screens stack the columns.
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

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ink)]">
      <PreJoinBar userName={userName} />
      <main className="flex flex-1 items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="grid w-full max-w-[1080px] items-center gap-8 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-12">
          <section aria-label="Preview" className="space-y-3">
            <Preview media={media} userName={userName} />
            {neverAllowed && !media.audioOn && !media.videoOn ? (
              <p className="text-center text-sm text-muted-foreground">Turn on your camera or mic to test them.</p>
            ) : null}
          </section>

          <section aria-label="Join" className="flex flex-col items-start">
            <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Meeting</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-foreground">{meeting.title}</h1>
            <p className="mt-2 text-sm text-[var(--ink-text)]">
              {pacificDayLabel(meeting.startsAt)} · {pacificTimeLabel(meeting.startsAt)}
            </p>

            {over ? (
              <p className="mt-6 text-sm text-muted-foreground">
                This meeting {meeting.status === "ENDED" ? "has ended" : "was cancelled"}.
              </p>
            ) : (
              <Button className="mt-6 h-11 w-full max-w-[320px]" onClick={onJoin} disabled={joining}>
                {joining ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {directJoin ? "Join now" : "Ask to join"}
              </Button>
            )}

            {!embedded ? (
              <Link href={"/meetings" as never} className="mt-4 text-sm text-[var(--brand-green)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]">
                Back to Meetings
              </Link>
            ) : null}

            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Encrypted on your device. Only people in the meeting can see and hear it.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
