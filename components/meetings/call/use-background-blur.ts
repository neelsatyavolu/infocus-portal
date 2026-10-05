"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaDevice } from "partytracks/client";
import { toast } from "sonner";
import { BLUR_PX, createBlurTransform } from "@/src/lib/meetings/client/background-blur";
import { mediapipeBlurEngine } from "@/src/lib/meetings/client/blur-engine";
import type { BackgroundMode } from "@/src/lib/meetings/client/meet-settings";

const UNAVAILABLE = "Background blur isn't available on this device. Your camera was turned off. Turn blur off to use your camera.";
const PARTIAL = "Background blur couldn't fully load. Your whole video is blurred.";
const REDUCED = "Blur reduced to keep your video smooth";

/** Calls `fn` the first time only. */
function once(fn: () => void) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

/**
 * Adds the blur transform to the camera while a background mode is on. The transform reference
 * is stable; switching Slight blur ↔ Blur only changes the radius (no restart). Privacy first:
 * with blur chosen the plain camera is never sent. A failed model keeps the whole frame blurred;
 * if processing can't run at all, the camera is turned off.
 */
export function useBackgroundBlur(camera: MediaDevice, mode: BackgroundMode) {
  const radius = useRef(mode === "off" ? BLUR_PX.blur : BLUR_PX[mode]);
  useEffect(() => {
    if (mode !== "off") radius.current = BLUR_PX[mode];
  }, [mode]);

  const [transform] = useState(() => {
    const warnUnavailable = once(() => toast.error(UNAVAILABLE));
    return createBlurTransform(mediapipeBlurEngine, () => radius.current, {
      onUnavailable: () => {
        camera.stopBroadcasting();
        warnUnavailable();
      },
      onPartial: once(() => toast(PARTIAL)),
      onReduced: once(() => toast(REDUCED))
    });
  });

  const on = mode !== "off";
  useEffect(() => {
    if (!on) return;
    camera.addTransform(transform);
    return () => camera.removeTransform(transform);
  }, [on, camera, transform]);
}
