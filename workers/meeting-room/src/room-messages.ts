/**
 * Pure handling of a parsed client message. Returns what the Durable Object should do;
 * host-only commands are enforced here against the effective hosts (ticket role or handed over).
 */
import type { MeetingClientMessage, MeetingServerMessage, MeetingTracks } from "../../../src/lib/meetings/protocol";
import { isEffectiveHost, type RoomState, type RoomTicket } from "./room-state";
import type { RateKind } from "./rate-limit";

export type MessageOutcome =
  | { kind: "pong" }
  /** Deliberate leave: mark this socket so its close hands host over at once. */
  | { kind: "leave" }
  /** Client diagnostics: rate limit per socket and log; never sent to anyone. */
  | { kind: "diag"; message: Extract<MeetingClientMessage, { t: "diag" }> }
  | { kind: "error"; message: string }
  /** State changed; broadcast a `participant` message for each uid in `changed`. */
  | { kind: "update"; state: RoomState; changed: readonly string[] }
  /** Send `muted` to every socket of each target uid. */
  | { kind: "muted"; targets: readonly string[]; muteKind: "audio" | "video"; by: string }
  /** Fan out to every admitted socket. */
  | { kind: "broadcast"; message: MeetingServerMessage };

const HOST_ONLY = new Set<MeetingClientMessage["t"]>(["mute", "muteAll", "lowerHand", "lowerAllHands"]);

/** Which rate limit (if any) a message counts against. */
export function rateKindOf(message: MeetingClientMessage): RateKind | null {
  if (message.t === "chat") return "chat";
  if (message.t === "reaction") return "reaction";
  return null;
}

function updateView(
  state: RoomState,
  uid: string,
  patch: Partial<RoomState["participants"][string]>
): RoomState {
  const view = state.participants[uid];
  if (!view) return state;
  return { ...state, participants: { ...state.participants, [uid]: { ...view, ...patch } } };
}

/** Every track's sessionId must be a Realtime session this uid created through the room. */
function ownsTracks(state: RoomState, uid: string, tracks: MeetingTracks): boolean {
  return Object.values(tracks).every(
    (track) => track?.sessionId === undefined || state.sessions[track.sessionId] === uid
  );
}

function lowerHands(state: RoomState, uids: readonly string[]): MessageOutcome {
  const raised = uids.filter((uid) => state.participants[uid]?.handRaisedAt != null);
  const next = raised.reduce((acc, uid) => updateView(acc, uid, { handRaisedAt: null }), state);
  return { kind: "update", state: next, changed: raised };
}

function handleHostCommand(state: RoomState, sender: RoomTicket, message: MeetingClientMessage): MessageOutcome {
  switch (message.t) {
    case "mute":
      if (!state.participants[message.uid]) return { kind: "error", message: "That person is not in the call." };
      return { kind: "muted", targets: [message.uid], muteKind: message.kind, by: sender.name };
    case "muteAll": {
      const targets = Object.values(state.participants)
        .filter((view) => view.uid !== sender.uid && !view.isScribe)
        .map((view) => view.uid);
      return { kind: "muted", targets, muteKind: "audio", by: sender.name };
    }
    case "lowerHand":
      return lowerHands(state, [message.uid]);
    case "lowerAllHands":
      return lowerHands(state, Object.keys(state.participants));
    default:
      return { kind: "error", message: "Unknown command." };
  }
}

function handleParticipantMessage(
  state: RoomState,
  sender: RoomTicket,
  message: MeetingClientMessage,
  now: number
): MessageOutcome {
  const uid = sender.uid;
  switch (message.t) {
    case "tracks":
      if (!ownsTracks(state, uid, message.tracks)) return { kind: "error", message: "Unknown media session." };
      return { kind: "update", state: updateView(state, uid, { tracks: message.tracks }), changed: [uid] };
    case "media": {
      const { audioOn, videoOn, screenOn } = message;
      return { kind: "update", state: updateView(state, uid, { audioOn, videoOn, screenOn }), changed: [uid] };
    }
    case "hand": {
      const current = state.participants[uid]?.handRaisedAt ?? null;
      const handRaisedAt = message.raised ? (current ?? now) : null;
      return { kind: "update", state: updateView(state, uid, { handRaisedAt }), changed: [uid] };
    }
    case "reaction":
      return { kind: "broadcast", message: { t: "reaction", uid, emoji: message.emoji, at: now } };
    case "chat": {
      const { id, ct, iv, epoch } = message;
      return { kind: "broadcast", message: { t: "chat", id, uid, name: sender.name, at: now, ct, iv, epoch } };
    }
    default:
      return handleHostCommand(state, sender, message);
  }
}

export function handleClientMessage(
  state: RoomState,
  sender: RoomTicket,
  message: MeetingClientMessage,
  now: number
): MessageOutcome {
  if (message.t === "ping") return { kind: "pong" };
  if (message.t === "leave") return { kind: "leave" };
  // Waiting-room and Scribe sockets may report too (a stuck lobby is worth seeing).
  if (message.t === "diag") return { kind: "diag", message };
  if (!sender.adm || !state.participants[sender.uid]) {
    return { kind: "error", message: "Wait until a host lets you in." };
  }
  if (sender.role === "scribe") return { kind: "error", message: "The Scribe cannot send messages." };
  if (HOST_ONLY.has(message.t) && !isEffectiveHost(state, sender)) {
    return { kind: "error", message: "Only a host can do that." };
  }
  return handleParticipantMessage(state, sender, message, now);
}
