"use client";

import { useEffect, useRef, useState } from "react";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";
import type { Payload } from "./livestreams-model";
import {
  diffSnapshots,
  isPersonalSnapshot,
  isTimestamp,
  personalSnapshot,
  type PersonalChanges,
  type PersonalSnapshot
} from "./since-last-visit";

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export type LastVisit = {
  /** When this person last opened the page (managers: which requests are new). */
  lastSeenAt: number | null;
  /** What changed for me since then (students and anyone on a crew). */
  changes: PersonalChanges | null;
};

/**
 * "Anything happen since I was here?" from data the page already loads, remembered per person
 * in this browser (try/catch inside the kit helpers). Compared once per visit, on the first
 * payload from the network; every later payload updates the snapshot quietly.
 */
export function useSinceLastVisit(fresh: Payload | null): LastVisit | null {
  const [visit, setVisit] = useState<LastVisit | null>(null);
  const compared = useRef(false);

  useEffect(() => {
    if (!fresh) return;
    const storage = browserStorage();
    const now = new Date();
    const seenKey = `livestreams:last-seen:v1:${fresh.currentUserId}`;
    const mineKey = `livestreams:mine:v1:${fresh.currentUserId}`;
    const next = personalSnapshot(fresh, now);
    if (!compared.current) {
      compared.current = true;
      const lastSeenAt = readRemembered<number | null>(storage, seenKey, null, isTimestamp);
      const previous = readRemembered<PersonalSnapshot | null>(storage, mineKey, null, isPersonalSnapshot);
      setVisit({ lastSeenAt, changes: previous ? diffSnapshots(previous, next, fresh.events) : null });
      writeRemembered(storage, seenKey, now.getTime());
    }
    writeRemembered(storage, mineKey, next);
  }, [fresh]);

  return visit;
}
