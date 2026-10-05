"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { INITIAL_AUTO_LOWER, nextAutoLower, type AutoLowerState } from "@/src/lib/meetings/client/hands";

/**
 * The person's own hand. The room is the source of truth for lowering (a host can lower it);
 * this client also lowers it after sustained speech. Only this client ever lowers its own hand:
 * it changes local state, and usePublish sends `hand: false`.
 */
export function useHand(serverHandAt: number | null, micOn: boolean) {
  const [hand, setHand] = useState(false);
  const handRef = useRef(hand);
  const micRef = useRef(micOn);
  const autoRef = useRef<AutoLowerState>(INITIAL_AUTO_LOWER);

  useEffect(() => {
    handRef.current = hand;
    micRef.current = micOn;
  }, [hand, micOn]);

  // A host lowered it: follow the room when it goes from raised to lowered.
  const prevServerHandAt = useRef<number | null>(null);
  useEffect(() => {
    if (prevServerHandAt.current !== null && serverHandAt === null) setHand(false);
    prevServerHandAt.current = serverHandAt;
  }, [serverHandAt]);

  /** Self speaking decisions (~10 Hz) from the shared detector that also drives the speaking ring. */
  const onSelfLevel = useCallback((speaking: boolean) => {
    const result = nextAutoLower(autoRef.current, {
      at: Date.now(),
      speaking,
      micOn: micRef.current,
      handUp: handRef.current
    });
    autoRef.current = result.state;
    if (!result.lower) return;
    handRef.current = false;
    setHand(false);
    toast("Your hand was lowered because you started speaking.");
  }, []);

  const toggleHand = useCallback(() => setHand((h) => !h), []);

  return { hand, toggleHand, onSelfLevel };
}
