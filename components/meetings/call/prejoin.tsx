"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Loader2, Lock, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { NEVER } from "rxjs";
import { Button, buttonVariants } from "@/components/ui/button";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { CallButton } from "./call-button";
import { DevicePickers } from "./device-pickers";
import { useMeetEmbedded } from "./embed-context";
import { VideoView, useObservableTrack } from "./media-elements";
import { useTrackLevel } from "./use-call-helpers";
import type { LocalMedia } from "./use-local-media";

function MicMeter({ track }: { track: MediaStreamTrack | undefined }) {
  const level = useTrackLevel(track);
  const bars = 8;
  const lit = Math.round(Math.min(1, level * 1.6) * bars);
  return (
    <div className="flex h-4 items-end gap-0.5" role="meter" aria-label="Microphone level" aria-valuenow={lit} aria-valuemin={0} aria-valuemax={bars}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "w-1 bg-[var(--brand-green)]" : "w-1 bg-[var(--ink-4)]"}
          style={{ height: `${30 + i * 10}%` }}
        />
      ))}
    </div>
  );
}

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

  const camera$ = useMemo(() => (media.videoOn ? media.camera.localMonitorTrack$ : NEVER), [media.videoOn, media.camera]);
  const mic$ = useMemo(() => (media.audioOn ? media.mic.localMonitorTrack$ : NEVER), [media.audioOn, media.mic]);
  const cameraTrack = useObservableTrack(media.videoOn ? camera$ : null);
  const micTrack = useObservableTrack(media.audioOn ? mic$ : null);

  const over = meeting.status === "ENDED" || meeting.status === "CANCELED";
  const directJoin = meeting.isHost || meeting.quickAccess;

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-6 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] md:grid-cols-[1.4fr_1fr] md:px-6">
      <section aria-label="Preview" className="space-y-3">
        <div className="relative aspect-video overflow-hidden border border-[var(--ink-4)] bg-[var(--ink-2)]">
          {media.videoOn && cameraTrack ? (
            <VideoView track={cameraTrack} mirror />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {media.videoOn ? "Starting camera…" : "Camera is off"}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-3">
            <CallButton label={media.audioOn ? "Turn off microphone" : "Turn on microphone"} off={!media.audioOn} onClick={media.toggleAudio}>
              {media.audioOn ? <Mic /> : <MicOff />}
            </CallButton>
            <CallButton label={media.videoOn ? "Turn off camera" : "Turn on camera"} off={!media.videoOn} onClick={media.toggleVideo}>
              {media.videoOn ? <Video /> : <VideoOff />}
            </CallButton>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <MicMeter track={micTrack} />
          <span>{media.audioOn ? "Speak to test your microphone" : "Microphone is off"}</span>
        </div>
        <DevicePickers media={media} />
      </section>

      <section aria-label="Join" className="space-y-4">
        <div className="eyebrow">Meeting</div>
        <h1 className="display-sm text-foreground">{meeting.title}</h1>
        <p className="text-sm text-muted-foreground">
          {pacificDayLabel(meeting.startsAt)} · {pacificTimeLabel(meeting.startsAt)} Pacific
        </p>
        <p className="text-sm text-[var(--ink-text)]">
          Joining as <span className="font-medium text-foreground">{userName}</span>
        </p>
        {over ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This meeting {meeting.status === "ENDED" ? "has ended" : "was cancelled"}.
            </p>
            {!embedded ? (
              <Link href={"/meetings" as never} className={buttonVariants({ variant: "outline" })}>
                Back to Meetings
              </Link>
            ) : null}
          </div>
        ) : (
          <Button size="lg" className="h-11 w-full md:w-auto" onClick={onJoin} disabled={joining}>
            {joining ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {directJoin ? "Join now" : "Ask to join"}
          </Button>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Encrypted on your device. Only people in the meeting can see and hear it.
        </p>
      </section>
    </main>
  );
}
