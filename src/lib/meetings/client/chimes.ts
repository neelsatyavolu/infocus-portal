import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";

/** Join/leave chime rules (pure): who counts, and when a chime may play. */

export const CHIME_THROTTLE_MS = 1500;
/** Like Meet: big calls stay quiet. */
export const CHIME_MAX_PEOPLE = 10;

export type ChimeKind = "join" | "leave";

type Person = Pick<MeetingParticipantView, "uid" | "isScribe">;

/** People who count for chimes: everyone but yourself and the scribe. */
export function chimeRoster(participants: readonly Person[], selfUid: string | null): ReadonlySet<string> {
  return new Set(participants.filter((p) => !p.isScribe && p.uid !== selfUid).map((p) => p.uid));
}

/** Join wins over leave when both happen in one update. Null = nothing to announce. */
export function rosterChange(previous: ReadonlySet<string>, next: ReadonlySet<string>): ChimeKind | null {
  for (const uid of next) if (!previous.has(uid)) return "join";
  for (const uid of previous) if (!next.has(uid)) return "leave";
  return null;
}

/** Whether to play now: setting on, call at most 10 people (you included), 1 per 1.5 s. */
export function shouldChime(input: { enabled: boolean; peopleCount: number; now: number; lastAt: number | null }) {
  if (!input.enabled || input.peopleCount > CHIME_MAX_PEOPLE) return false;
  return input.lastAt === null || input.now - input.lastAt >= CHIME_THROTTLE_MS;
}
