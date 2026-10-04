"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { meetingBrowserSupport } from "@/src/lib/meetings/client/e2ee";
import { resumeAudio } from "@/src/lib/meetings/client/audio-level";
import { CallRoom } from "./call-room";
import { PreJoin } from "./prejoin";
import { DeniedScreen, EndScreen, JoiningScreen, WaitingScreen } from "./status-screens";
import { useLocalMedia } from "./use-local-media";
import { useMeetingCall } from "./use-meeting-call";

function SupportedCall({ meetingId, userName }: { meetingId: string; userName: string }) {
  const media = useLocalMedia();
  const { setAudio, setVideo } = media;

  const onMuted = useCallback(
    (kind: "audio" | "video", by: string) => {
      if (kind === "audio") setAudio(false);
      else setVideo(false);
      toast(`You were muted by ${by}`, { description: kind === "audio" ? "Unmute when you're ready to talk." : undefined });
    },
    [setAudio, setVideo]
  );

  const call = useMeetingCall(meetingId, onMuted);

  useEffect(() => {
    if (call.error && call.stage !== "error") toast.error(call.error);
  }, [call.error, call.stage]);

  const join = () => {
    // The tap that joins also unlocks audio playback (iOS).
    resumeAudio();
    void call.join();
  };

  switch (call.stage) {
    case "prejoin":
      return <PreJoin meetingId={meetingId} userName={userName} media={media} joining={false} onJoin={join} />;
    case "joining":
      return <JoiningScreen />;
    case "waiting":
      return <WaitingScreen onLeave={call.leave} />;
    case "denied":
      return <DeniedScreen onAskAgain={call.askAgain} />;
    case "incall":
      return <CallRoom meetingId={meetingId} call={call} media={media} />;
    case "error":
      return <EndScreen kind="error" message={call.error} onRejoin={join} />;
    default:
      return <EndScreen kind={call.stage} onRejoin={join} />;
  }
}

/** Full-screen call: browser check → pre-join → lobby → call → end screens. */
export default function MeetCall({ meetingId, userName }: { meetingId: string; userName: string }) {
  const [support] = useState(meetingBrowserSupport);
  if (!support.ok) return <EndScreen kind="unsupported" message={support.reason} />;
  return <SupportedCall meetingId={meetingId} userName={userName} />;
}
