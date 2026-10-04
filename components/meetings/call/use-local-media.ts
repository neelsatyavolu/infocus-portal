"use client";

import { useEffect, useMemo, useState } from "react";
import { getCamera, getMic, getScreenshare, type MediaDevice, type Screenshare } from "partytracks/client";
import { useObservableAsValue } from "partytracks/react";
import { NEVER } from "rxjs";
import { toast } from "sonner";

export type LocalMedia = {
  mic: MediaDevice;
  camera: MediaDevice;
  audioOn: boolean;
  videoOn: boolean;
  screen: Screenshare | null;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setAudio: (on: boolean) => void;
  setVideo: (on: boolean) => void;
  startScreenShare: () => void;
  stopScreenShare: () => void;
  speakerId: string;
  setSpeakerId: (id: string) => void;
};

function deviceErrorMessage(kind: "microphone" | "camera", error: Error) {
  if (error.name === "NotAllowedError") {
    return `Allow ${kind} access in your browser settings to use it in the meeting.`;
  }
  return `Couldn't start your ${kind}. Check that no other app is using it.`;
}

/** Mic, camera and screen share sources (partytracks), shared by pre-join and the call. */
export function useLocalMedia(): LocalMedia {
  const [mic] = useState(() => getMic({ broadcasting: true }));
  const [camera] = useState(() => getCamera({ broadcasting: true }));
  const [screen, setScreen] = useState<Screenshare | null>(null);
  const [speakerId, setSpeakerId] = useState("");

  const audioOn = useObservableAsValue(mic.isBroadcasting$, true);
  const videoOn = useObservableAsValue(camera.isBroadcasting$, true);

  useEffect(() => {
    const subs = [
      mic.error$.subscribe((error) => toast.error(deviceErrorMessage("microphone", error))),
      camera.error$.subscribe((error) => toast.error(deviceErrorMessage("camera", error)))
    ];
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [mic, camera]);

  const screenEnabled$ = useMemo(() => screen?.isSourceEnabled$ ?? NEVER, [screen]);
  const screenEnabled = useObservableAsValue(screenEnabled$, true);
  useEffect(() => {
    // The browser's "Stop sharing" bar disables the source; drop the share with it.
    if (screen && !screenEnabled) setScreen(null);
  }, [screen, screenEnabled]);

  return useMemo<LocalMedia>(
    () => ({
      mic,
      camera,
      audioOn,
      videoOn,
      screen,
      toggleAudio: () => mic.toggleBroadcasting(),
      toggleVideo: () => camera.toggleBroadcasting(),
      setAudio: (on) => (on ? mic.startBroadcasting() : mic.stopBroadcasting()),
      setVideo: (on) => (on ? camera.startBroadcasting() : camera.stopBroadcasting()),
      startScreenShare: () => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          toast.error("This device can't share its screen.");
          return;
        }
        const share = getScreenshare({ video: { options: { broadcasting: true } }, audio: false });
        share.enableSource();
        setScreen(share);
      },
      stopScreenShare: () => {
        setScreen((current) => {
          current?.disableSource();
          return null;
        });
      },
      speakerId,
      setSpeakerId
    }),
    [mic, camera, audioOn, videoOn, screen, speakerId]
  );
}
