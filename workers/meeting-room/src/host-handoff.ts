/**
 * Pure host handoff: when the last host leaves, host passes to someone still in the call so the
 * lobby and moderation keep working. Deliberate leave (`leave` message) hands over at once; a
 * dropped connection waits MEETING_HOST_HANDOFF_GRACE_MS in case it was a refresh.
 */
import { MEETING_HOST_HANDOFF_GRACE_MS } from "../../../src/lib/meetings/protocol";
import type { RoomState } from "./room-state";

export function hasHostPresent(state: RoomState): boolean {
  return Object.values(state.participants).some((view) => view.isHost && !view.isScribe);
}

/** Next host: an exec first, otherwise whoever has been in the call longest. Never the Scribe. */
export function pickNextHost(state: RoomState): string | null {
  const candidates = Object.values(state.participants)
    .filter((view) => !view.isScribe)
    .sort((a, b) => {
      const execOrder = Number(Boolean(state.execUids[b.uid])) - Number(Boolean(state.execUids[a.uid]));
      return execOrder !== 0 ? execOrder : a.joinedAt - b.joinedAt;
    });
  return candidates[0]?.uid ?? null;
}

/** Hand host over now (or clear the pending handoff when nobody is left or a host is back). */
export function promoteNextHost(state: RoomState): { state: RoomState; promoted: string | null } {
  if (hasHostPresent(state)) return { state: { ...state, handoffAt: null }, promoted: null };
  const uid = pickNextHost(state);
  if (!uid) return { state: { ...state, handoffAt: null }, promoted: null };
  const view = state.participants[uid]!;
  return {
    state: {
      ...state,
      participants: { ...state.participants, [uid]: { ...view, isHost: true } },
      promotedHosts: { ...state.promotedHosts, [uid]: true },
      handoffAt: null
    },
    promoted: uid
  };
}

/** A host's last socket closed (their view is already gone from `state`). */
export function afterHostLeft(
  state: RoomState,
  deliberate: boolean,
  now: number
): { state: RoomState; promoted: string | null } {
  if (hasHostPresent(state)) return { state, promoted: null };
  if (deliberate) return promoteNextHost(state);
  return { state: { ...state, handoffAt: now + MEETING_HOST_HANDOFF_GRACE_MS }, promoted: null };
}

export function isHandoffDue(state: RoomState, now: number): boolean {
  return state.endedAt === null && state.handoffAt !== null && now >= state.handoffAt;
}
