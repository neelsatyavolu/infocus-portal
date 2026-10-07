import type {
  MeetingParticipantView,
  MeetingRoomSettings,
  MeetingServerMessage,
  MeetingWaitingView,
  MeetingWatchState
} from "@/src/lib/meetings/protocol";

/** Where the call is, from the room's point of view. Media and chat live elsewhere. */
export type RoomPhase = "connecting" | "waiting" | "denied" | "admitted" | "removed" | "ended";

export type RoomState = {
  phase: RoomPhase;
  selfUid: string | null;
  isHost: boolean;
  participants: Readonly<Record<string, MeetingParticipantView>>;
  waiting: readonly MeetingWaitingView[];
  settings: MeetingRoomSettings;
  epoch: number;
  /** Bumped by the room's `agenda` event; the agenda panel refetches when it changes. */
  agendaVersion: number;
  /** Watch together in progress (null: none). */
  watch: MeetingWatchState | null;
};

export const INITIAL_ROOM_STATE: RoomState = {
  phase: "connecting",
  selfUid: null,
  isHost: false,
  participants: {},
  waiting: [],
  settings: { quickAccess: false, notesEnabled: true },
  epoch: 0,
  agendaVersion: 0,
  watch: null
};

const TERMINAL: ReadonlySet<RoomPhase> = new Set(["removed", "ended"]);

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Applies one room message. Messages that only drive side effects (chat, reaction, muted, pong) are no-ops here. */
export function roomReducer(state: RoomState, message: MeetingServerMessage): RoomState {
  if (TERMINAL.has(state.phase)) return state;
  switch (message.t) {
    case "welcome":
      return {
        ...state,
        phase: message.self.admitted ? "admitted" : "waiting",
        selfUid: message.self.uid,
        isHost: message.self.isHost,
        participants: Object.fromEntries(message.participants.map((p) => [p.uid, p])),
        waiting: message.waiting,
        settings: message.settings,
        epoch: message.epoch,
        watch: message.watch ?? null
      };
    case "participant":
      return { ...state, participants: { ...state.participants, [message.participant.uid]: message.participant } };
    case "left":
      return message.uid in state.participants
        ? { ...state, participants: withoutKey(state.participants, message.uid) }
        : state;
    case "waiting":
      return { ...state, waiting: message.waiting };
    case "denied":
      return { ...state, phase: "denied" };
    case "removed":
      return { ...state, phase: "removed" };
    case "ended":
      return { ...state, phase: "ended" };
    case "rekey":
      return { ...state, epoch: Math.max(state.epoch, message.epoch) };
    case "role":
      return state.isHost === message.isHost ? state : { ...state, isHost: message.isHost };
    case "agenda":
      return { ...state, agendaVersion: Math.max(state.agendaVersion + 1, message.version) };
    case "settings":
      return { ...state, settings: message.settings };
    case "watch":
      return { ...state, watch: message.watch };
    default:
      return state;
  }
}

/** Starts a fresh connection (new ticket after admission or "Ask again") without losing a terminal phase. */
export function resetForReconnect(state: RoomState): RoomState {
  if (TERMINAL.has(state.phase)) return state;
  return { ...state, phase: "connecting" };
}

export function participantList(state: RoomState) {
  return Object.values(state.participants).sort((a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid));
}

export function raisedHands(state: RoomState) {
  return participantList(state)
    .filter((p) => p.handRaisedAt !== null)
    .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0));
}

export function scribePresent(state: RoomState) {
  return Object.values(state.participants).some((p) => p.isScribe);
}

/**
 * A cut is playing together, or someone is sharing their screen's sound. The Scribe stops
 * recording meanwhile so that audio (which mics also pick up) stays out of the notes.
 */
export function sharedSoundPlaying(state: RoomState) {
  if (state.watch?.playing) return true;
  return Object.values(state.participants).some((p) => !p.isScribe && p.screenOn && Boolean(p.tracks.screenAudio?.trackName));
}
