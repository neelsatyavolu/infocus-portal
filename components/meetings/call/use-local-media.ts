"use client";

import { useEffect, useMemo, useState } from "react";
import { getCamera, getMic, getScreenshare, type MediaDevice, type Screenshare } from "partytracks/client";
import { useObservableAsValue } from "partytracks/react";
import { NEVER, of } from "rxjs";
import { toast } from "sonner";
import { keepBroadcasting } from "@/src/lib/meetings/client/keep-broadcasting";
import { resumeVoiceIsolation } from "@/src/lib/meetings/client/voice-isolation";
import { CAMERA_CAPTURE, SCREEN_CAPTURE } from "@/src/lib/meetings/client/quality";
import type { MeetSettings } from "@/src/lib/meetings/client/meet-settings";
import { useBackgroundBlur } from "./use-background-blur";
import { useDevicePrefs } from "./use-device-prefs";
import { useMeetSettings } from "./use-meet-settings";
import { useVoiceIsolation } from "./use-voice-isolation";

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
  /** RNNoise noise suppression on the device (mic transform). */
  voiceIsolation: boolean;
  setVoiceIsolation: (on: boolean) => void;
  /** Background, mirror, send/receive quality and chimes (saved on this device). */
  settings: MeetSettings;
  updateSettings: (patch: Partial<MeetSettings>) => void;
};

/** Browser processing stays on underneath voice isolation (echo cancellation matters most). */
const MIC_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

function markDetail(track: MediaStreamTrack) {
  if ("contentHint" in track) track.contentHint = "detail";
  return of(track);
}

function deviceErrorMessage(kind: "microphone" | "camera", error: Error) {
  if (error.name === "NotAllowedError") {
    return `Allow ${kind} access in your browser settings to use it in the meeting.`;
  }
  return `Couldn't start your ${kind}. Check that no other app is using it.`;
}

/** Mic, camera and screen share sources (partytracks), shared by pre-join and the call. */
export function useLocalMedia(): LocalMedia {
  // Both start off; people can turn them on in pre-join to test before joining.
  // retainIdleTrack false: partytracks' default (true) keeps the mic open whenever broadcastTrack$
  // is subscribed, i.e. for the whole page, muted or not. Off, the device runs only while
  // unmuted or while a mic test monitors it, so the browser's mic indicator matches reality.
  const [mic] = useState(() => getMic({ broadcasting: false, constraints: MIC_CONSTRAINTS, retainIdleTrack: false }));
  const [camera] = useState(() => getCamera({ broadcasting: false, constraints: CAMERA_CAPTURE }));
  const [screen, setScreen] = useState<Screenshare | null>(null);
  const [speakerId, setSpeakerId] = useState("");
  const { voiceIsolation, setVoiceIsolation } = useVoiceIsolation(mic);
  useDevicePrefs(mic, camera, setSpeakerId);
  const { settings, updateSettings } = useMeetSettings();
  useBackgroundBlur(camera, settings.background);

  const audioOn = useObservableAsValue(mic.isBroadcasting$, false);
  const videoOn = useObservableAsValue(camera.isBroadcasting$, false);

  useEffect(() => keepBroadcasting([mic, camera]), [mic, camera]);

  // The chosen speaker was unplugged (USB, Bluetooth): fall back to the system default output.
  useEffect(() => {
    const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!speakerId || !devices?.enumerateDevices) return;
    const check = () =>
      devices
        .enumerateDevices()
        .then((all) => {
          if (!all.some((d) => d.kind === "audiooutput" && d.deviceId === speakerId)) setSpeakerId("");
        })
        .catch(() => undefined);
    devices.addEventListener?.("devicechange", check);
    return () => devices.removeEventListener?.("devicechange", check);
  }, [speakerId]);

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
      toggleAudio: () => {
        // The unmute tap is a user gesture: start any suspended voice-isolation audio.
        resumeVoiceIsolation();
        mic.toggleBroadcasting();
      },
      toggleVideo: () => camera.toggleBroadcasting(),
      setAudio: (on) => (on ? mic.startBroadcasting() : mic.stopBroadcasting()),
      setVideo: (on) => (on ? camera.startBroadcasting() : camera.stopBroadcasting()),
      startScreenShare: () => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          toast.error("This device can't share its screen.");
          return;
        }
        const share = getScreenshare({
          video: { constraints: SCREEN_CAPTURE, options: { broadcasting: true } },
          audio: false
        });
        // Keep text sharp: prefer resolution over frame rate.
        share.video.addTransform(markDetail);
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
      setSpeakerId,
      voiceIsolation,
      setVoiceIsolation,
      settings,
      updateSettings
    }),
    [mic, camera, audioOn, videoOn, screen, speakerId, voiceIsolation, setVoiceIsolation, settings, updateSettings]
  );
}
