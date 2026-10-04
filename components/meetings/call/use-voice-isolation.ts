"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaDevice } from "partytracks/client";
import { toast } from "sonner";
import { rnnoiseEngine } from "@/src/lib/meetings/client/rnnoise-engine";
import {
  createVoiceIsolationTransform,
  readVoiceIsolation,
  writeVoiceIsolation
} from "@/src/lib/meetings/client/voice-isolation";

const UNAVAILABLE = "Voice isolation isn't available on this device.";

/**
 * Voice isolation toggle (on by default, remembered per device). While on, the RNNoise transform
 * sits in the mic's partytracks pipeline, so the broadcast and the local meter both get the
 * processed track. The transform reference is stable so it can be removed.
 */
export function useVoiceIsolation(mic: MediaDevice) {
  const [enabled, setEnabledState] = useState(readVoiceIsolation);
  const [transform] = useState(() => {
    let warned = false;
    return createVoiceIsolationTransform(rnnoiseEngine, () => {
      if (warned) return;
      warned = true;
      toast.error(UNAVAILABLE);
    });
  });

  useEffect(() => {
    if (!enabled) return;
    mic.addTransform(transform);
    return () => mic.removeTransform(transform);
  }, [enabled, mic, transform]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    writeVoiceIsolation(on);
  }, []);

  return { voiceIsolation: enabled, setVoiceIsolation: setEnabled };
}
