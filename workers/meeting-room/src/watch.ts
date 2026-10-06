/**
 * Watch together: the room keeps one shared playback record and stamps every change with its own
 * clock. Anyone admitted may start, play, pause, seek or stop. Pure; the DO commits and fans out.
 */
import {
  MEETING_WATCH_START_LEAD_MS,
  type MeetingClientMessage,
  type MeetingWatchState
} from "../../../src/lib/meetings/protocol";
import type { RoomState, RoomTicket } from "./room-state";

export type WatchMessage = Extract<MeetingClientMessage, { t: "watch" }>;

export type WatchOutcome = { ok: true; state: RoomState } | { ok: false; error: string };

const STALE = "That video changed. Try again.";

export function applyWatch(
  state: RoomState,
  sender: Pick<RoomTicket, "uid" | "name">,
  message: WatchMessage,
  now: number,
  newId: () => string
): WatchOutcome {
  const by = { by: sender.uid, byName: sender.name };
  if (message.action === "start") {
    const watch: MeetingWatchState = {
      id: newId(),
      mediaId: message.mediaId,
      versionId: message.versionId,
      playing: true,
      position: 0,
      at: now + MEETING_WATCH_START_LEAD_MS,
      action: "start",
      ...by
    };
    return { ok: true, state: { ...state, watch } };
  }

  const current = state.watch;
  if (!current || current.id !== message.id) return { ok: false, error: STALE };
  if (message.action === "stop") return { ok: true, state: { ...state, watch: null } };

  const playing = message.action === "play" ? true : message.action === "pause" ? false : current.playing;
  const watch: MeetingWatchState = { ...current, playing, position: message.position, at: now, action: message.action, ...by };
  return { ok: true, state: { ...state, watch } };
}
