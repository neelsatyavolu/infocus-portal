"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { meetingBrowserSupport } from "@/src/lib/meetings/client/e2ee";
import { resumeAudio } from "@/src/lib/meetings/client/audio-level";
import { canJoinNow, joinOpensAtMs } from "@/src/lib/meetings/client/time";
import { CallRoom } from "./call-room";
import { MeetEmbedProvider, useExitCall } from "./embed-context";
import { OpensAtScreen } from "./opens-at-screen";
import { PreJoin } from "./prejoin";
import { DeniedScreen, EndScreen, JoiningScreen, WaitingScreen } from "./status-screens";
import { useLocalMedia } from "./use-local-media";
import { useMeetingCall, type CallStage } from "./use-meeting-call";

/** When the server says "not open yet" but our clock disagrees, wait at least this long. */
const SERVER_NOT_OPEN_RETRY_MS = 15_000;

/** Stages where local media may stay on; every other stage is an end screen. */
const LIVE_STAGES: ReadonlySet<CallStage> = new Set(["prejoin", "joining", "waiting", "denied", "incall"]);

function SupportedCall({
  meeting,
  userName,
  onNotOpen
}: {
  meeting: MeetingDetail;
  userName: string;
  onNotOpen: () => void;
}) {
  const media = useLocalMedia();
  const { setAudio, setVideo } = media;
  const exitCall = useExitCall();

  const onMuted = useCallback(
    (kind: "audio" | "video", by: string) => {
      if (kind === "audio") setAudio(false);
      else setVideo(false);
      toast(`You were muted by ${by}`, { description: kind === "audio" ? "Unmute when you're ready to talk." : undefined });
    },
    [setAudio, setVideo]
  );

  const call = useMeetingCall(meeting.id, onMuted);

  useEffect(() => {
    if (call.error && call.stage !== "error") toast.error(call.error);
  }, [call.error, call.stage]);

  useEffect(() => {
    if (call.notOpen) onNotOpen();
  }, [call.notOpen, onNotOpen]);

  // End screens (ended, removed, left, full, error…) stop capture: the mic and camera would
  // otherwise stay live (and their indicators on) behind the end screen. Rejoining starts muted.
  const ended = !LIVE_STAGES.has(call.stage);
  const { stopScreenShare } = media;
  useEffect(() => {
    if (!ended) return;
    setAudio(false);
    setVideo(false);
    stopScreenShare();
  }, [ended, setAudio, setVideo, stopScreenShare]);

  const join = () => {
    // The tap that joins also unlocks audio playback (iOS).
    resumeAudio();
    void call.join();
  };

  const leave = async () => {
    await call.leave();
    exitCall();
  };

  switch (call.stage) {
    case "prejoin":
      return <PreJoin meeting={meeting} userName={userName} media={media} joining={false} onJoin={join} />;
    case "joining":
      return <JoiningScreen />;
    case "waiting":
      return <WaitingScreen onLeave={() => void leave()} />;
    case "denied":
      return <DeniedScreen onAskAgain={call.askAgain} />;
    case "incall":
      return <CallRoom meetingId={meeting.id} call={call} media={media} onLeave={() => void leave()} />;
    case "error":
      return <EndScreen kind="error" message={call.error} onRejoin={join} />;
    default:
      return <EndScreen kind={call.stage} onRejoin={join} />;
  }
}

/** Loads the meeting, then holds people on "Opens at …" until the join window opens. */
function MeetingGate({ meetingId, userName }: { meetingId: string; userName: string }) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { meeting: next } = await meetingsApi.get(meetingId);
      setMeeting(next);
      return next;
    } catch (err) {
      setLoadError(errorMessage(err, "Couldn't load this meeting."));
      return null;
    }
  }, [meetingId]);

  useEffect(() => {
    void load().then((next) => {
      if (next && !canJoinNow(next)) setWaitUntil(joinOpensAtMs(next));
    });
  }, [load]);

  const onNotOpen = useCallback(() => {
    void load().then((next) => {
      const opensAt = next ? joinOpensAtMs(next) : 0;
      setWaitUntil(Math.max(opensAt, Date.now() + SERVER_NOT_OPEN_RETRY_MS));
    });
  }, [load]);

  if (loadError) return <EndScreen kind="error" message={loadError} />;
  if (!meeting) return <JoiningScreen />;
  if (waitUntil !== null) {
    return <OpensAtScreen meeting={meeting} opensAt={waitUntil} onOpen={() => setWaitUntil(null)} />;
  }
  return <SupportedCall meeting={meeting} userName={userName} onNotOpen={onNotOpen} />;
}

/** Full-screen call: browser check → opens-at wait → pre-join → lobby → call → end screens. */
export default function MeetCall({
  meetingId,
  userName,
  embedded
}: {
  meetingId: string;
  userName: string;
  embedded: boolean;
}) {
  const [support] = useState(meetingBrowserSupport);
  return (
    <MeetEmbedProvider value={embedded}>
      <TooltipProvider delayDuration={400}>
        {support.ok ? (
          <MeetingGate meetingId={meetingId} userName={userName} />
        ) : (
          <EndScreen kind="unsupported" message={support.reason} />
        )}
      </TooltipProvider>
    </MeetEmbedProvider>
  );
}
