import type { ShowChapter } from "@/src/lib/show-chapters";

/** Speeds the shared player offers (the review player has its own list). */
export const PLAYER_RATES = [0.5, 1, 1.25, 1.5, 2] as const;

const SKIP_SECONDS = 10;
const NUDGE_SECONDS = 5;

export type PlayerKeyAction =
  | { kind: "toggle" }
  | { kind: "seekBy"; seconds: number }
  | { kind: "seekToFraction"; fraction: number }
  | { kind: "volumeBy"; delta: number }
  | { kind: "mute" }
  | { kind: "fullscreen" };

/** What a key press on the focused player does (YouTube's keys), or null to let it through. */
export function playerKeyAction(key: string): PlayerKeyAction | null {
  switch (key.toLowerCase()) {
    case " ":
    case "k":
      return { kind: "toggle" };
    case "j":
      return { kind: "seekBy", seconds: -SKIP_SECONDS };
    case "l":
      return { kind: "seekBy", seconds: SKIP_SECONDS };
    case "arrowleft":
      return { kind: "seekBy", seconds: -NUDGE_SECONDS };
    case "arrowright":
      return { kind: "seekBy", seconds: NUDGE_SECONDS };
    case "arrowup":
      return { kind: "volumeBy", delta: 0.1 };
    case "arrowdown":
      return { kind: "volumeBy", delta: -0.1 };
    case "m":
      return { kind: "mute" };
    case "f":
      return { kind: "fullscreen" };
    default:
      return /^[0-9]$/.test(key) ? { kind: "seekToFraction", fraction: Number(key) / 10 } : null;
  }
}

/** The chapter playing at `time` (chapters in time order), or null before the first. */
export function chapterAt(chapters: ShowChapter[], time: number): ShowChapter | null {
  let current: ShowChapter | null = null;
  for (const chapter of chapters) {
    if (chapter.start > time) break;
    current = chapter;
  }
  return current;
}

/** `time` kept inside the video (0 when the length isn't known yet). */
export function clampTime(time: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(duration, time));
}
