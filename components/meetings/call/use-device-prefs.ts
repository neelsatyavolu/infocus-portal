"use client";

import { useEffect } from "react";
import type { MediaDevice } from "partytracks/client";
import { hasLabels, loadDevicePrefs, matchSavedDevice, type DeviceKind } from "@/src/lib/meetings/client/device-prefs";

/**
 * Re-applies the remembered mic, camera and speaker once the browser lists labelled devices
 * (after permission). Each kind is applied at most once per page; no match means the default.
 */
export function useDevicePrefs(mic: MediaDevice, camera: MediaDevice, setSpeakerId: (id: string) => void) {
  useEffect(() => {
    const saved = loadDevicePrefs();
    const applied = new Set<DeviceKind>();

    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    const applySpeaker = () => {
      if (applied.has("speaker") || !saved.speaker || !media?.enumerateDevices) return;
      media
        .enumerateDevices()
        .then((all) => {
          const outputs = all.filter((d) => d.kind === "audiooutput");
          if (applied.has("speaker") || !hasLabels(outputs)) return;
          applied.add("speaker");
          const match = matchSavedDevice(saved.speaker, outputs);
          if (match) setSpeakerId(match.deviceId);
        })
        .catch(() => undefined);
    };

    const watch = (kind: "mic" | "camera", device: MediaDevice) =>
      device.devices$.subscribe((devices) => {
        // Output labels appear with input permission, so retry the speaker here too.
        if (hasLabels(devices)) applySpeaker();
        if (applied.has(kind) || !saved[kind] || !hasLabels(devices)) return;
        applied.add(kind);
        const match = matchSavedDevice(saved[kind], devices);
        if (match) device.setPreferredDevice(match);
      });
    const subs = [watch("mic", mic), watch("camera", camera)];
    applySpeaker();
    media?.addEventListener?.("devicechange", applySpeaker);

    return () => {
      subs.forEach((sub) => sub.unsubscribe());
      media?.removeEventListener?.("devicechange", applySpeaker);
    };
  }, [mic, camera, setSpeakerId]);
}
