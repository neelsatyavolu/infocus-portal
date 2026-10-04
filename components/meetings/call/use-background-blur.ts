"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaDevice } from "partytracks/client";
import { toast } from "sonner";
import { BLUR_PX, createBlurTransform } from "@/src/lib/meetings/client/background-blur";
import { mediapipeBlurEngine } from "@/src/lib/meetings/client/blur-engine";
import type { BackgroundMode } from "@/src/lib/meetings/client/meet-settings";

const UNAVAILABLE = "Background blur isn't available on this device.";

/**
 * Adds the blur transform to the camera while a background mode is on. The transform reference
 * is stable; switching Slight blur ↔ Blur only changes the radius (no restart).
 */
export function useBackgroundBlur(camera: MediaDevice, mode: BackgroundMode) {
  const radius = useRef(mode === "off" ? BLUR_PX.blur : BLUR_PX[mode]);
  useEffect(() => {
    if (mode !== "off") radius.current = BLUR_PX[mode];
  }, [mode]);

  const [transform] = useState(() => {
    let warned = false;
    return createBlurTransform(
      mediapipeBlurEngine,
      () => radius.current,
      () => {
        if (warned) return;
        warned = true;
        toast.error(UNAVAILABLE);
      }
    );
  });

  const on = mode !== "off";
  useEffect(() => {
    if (!on) return;
    camera.addTransform(transform);
    return () => camera.removeTransform(transform);
  }, [on, camera, transform]);
}
