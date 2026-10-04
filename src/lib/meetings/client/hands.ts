import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import { SPEAKING_LEVEL } from "./layout";

/** Raised-hand queue and Meet-style auto-lower. Pure: no timers, no React. */

type HandFields = Pick<MeetingParticipantView, "uid" | "handRaisedAt" | "isScribe">;

/** uid → 1-based queue position, ordered by handRaisedAt (first raised = 1); ties by uid. */
export function handQueue(participants: readonly HandFields[]): Readonly<Record<string, number>> {
  const raised = participants
    .filter((p) => !p.isScribe && p.handRaisedAt !== null)
    .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0) || a.uid.localeCompare(b.uid));
  return Object.fromEntries(raised.map((p, i) => [p.uid, i + 1]));
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Speaking this long (ms) within the window lowers your own hand. */
export const AUTO_LOWER_SPEAKING_MS = 2500;
export const AUTO_LOWER_WINDOW_MS = 4000;
/** Gaps longer than this between samples don't count as speech (tab asleep, meter restarted). */
const MAX_SAMPLE_GAP_MS = 500;

export type AutoLowerState = { samples: readonly { at: number; speaking: boolean }[] };
export const INITIAL_AUTO_LOWER: AutoLowerState = { samples: [] };

export type AutoLowerSample = { at: number; level: number; micOn: boolean; handUp: boolean };

/** Speaking time inside the window: each interval counts when the sample that starts it was speech. */
function speakingMs(samples: AutoLowerState["samples"]) {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const gap = samples[i].at - samples[i - 1].at;
    if (samples[i - 1].speaking && gap > 0 && gap <= MAX_SAMPLE_GAP_MS) total += gap;
  }
  return total;
}

/**
 * Feeds one self mic level sample. Returns `lower: true` once the person has spoken for about
 * 2.5 s within 4 s with their mic on and hand up. Mic off or hand down resets, so speech from
 * before the hand went up never counts, and short blips never add up to enough.
 */
export function nextAutoLower(state: AutoLowerState, sample: AutoLowerSample): { state: AutoLowerState; lower: boolean } {
  if (!sample.micOn || !sample.handUp) {
    return { state: state.samples.length ? INITIAL_AUTO_LOWER : state, lower: false };
  }
  const samples = [...state.samples, { at: sample.at, speaking: sample.level >= SPEAKING_LEVEL }].filter(
    (s) => s.at >= sample.at - AUTO_LOWER_WINDOW_MS
  );
  if (speakingMs(samples) >= AUTO_LOWER_SPEAKING_MS) return { state: INITIAL_AUTO_LOWER, lower: true };
  return { state: { samples }, lower: false };
}
