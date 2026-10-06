/** Parsing of untrusted input: client WebSocket messages and Portal room events. */
import {
  MEETING_REACTIONS,
  MEETING_WATCH_MAX_SECONDS,
  type MeetingClientMessage,
  type MeetingReaction,
  type MeetingRoomEvent,
  type MeetingTrackKind,
  type MeetingTrackMetadata,
  type MeetingTracks
} from "../../../src/lib/meetings/protocol";

import { isDiagWithinSize, parseDiag } from "./diagnostics";

export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_CHAT_CT_CHARS = 8 * 1024;
const MAX_ID_CHARS = 128;
const TRACK_KINDS: readonly MeetingTrackKind[] = ["audio", "video", "screen", "screenAudio"];

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown, max = MAX_ID_CHARS): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isEpoch(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isReaction(value: unknown): value is MeetingReaction {
  return typeof value === "string" && (MEETING_REACTIONS as readonly string[]).includes(value);
}

function parseTrack(value: unknown): MeetingTrackMetadata | null {
  if (!isObj(value)) return null;
  const { location, sessionId, trackName, mid } = value;
  if (location !== undefined && location !== "local" && location !== "remote") return null;
  if (sessionId !== undefined && !isId(sessionId)) return null;
  if (trackName !== undefined && !isId(trackName)) return null;
  if (mid !== undefined && mid !== null && !isId(mid, 32)) return null;
  return { location, sessionId, trackName, mid } as MeetingTrackMetadata;
}

function parseTracks(value: unknown): MeetingTracks | null {
  if (!isObj(value)) return null;
  const entries: [MeetingTrackKind, MeetingTrackMetadata][] = [];
  for (const [kind, raw] of Object.entries(value)) {
    if (!(TRACK_KINDS as readonly string[]).includes(kind)) return null;
    if (raw === undefined || raw === null) continue;
    const track = parseTrack(raw);
    if (!track) return null;
    entries.push([kind as MeetingTrackKind, track]);
  }
  return Object.fromEntries(entries) as MeetingTracks;
}

function parseChat(msg: Obj): MeetingClientMessage | null {
  const { id, ct, iv, epoch } = msg;
  if (!isId(id, 64) || !isId(iv, 64) || !isEpoch(epoch)) return null;
  if (typeof ct !== "string" || ct.length === 0 || ct.length > MAX_CHAT_CT_CHARS) return null;
  return { t: "chat", id, ct, iv, epoch };
}

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MEETING_WATCH_MAX_SECONDS;
}

function parseWatch(msg: Obj): MeetingClientMessage | null {
  switch (msg.action) {
    case "start":
      return isId(msg.mediaId) && isId(msg.versionId)
        ? { t: "watch", action: "start", mediaId: msg.mediaId, versionId: msg.versionId }
        : null;
    case "play":
    case "pause":
    case "seek":
      return isId(msg.id, 64) && isPosition(msg.position)
        ? { t: "watch", action: msg.action, id: msg.id, position: msg.position }
        : null;
    case "stop":
      return isId(msg.id, 64) ? { t: "watch", action: "stop", id: msg.id } : null;
    default:
      return null;
  }
}

function parseClientShape(msg: Obj): MeetingClientMessage | null {
  switch (msg.t) {
    case "ping":
    case "leave":
    case "muteAll":
    case "lowerAllHands":
      return { t: msg.t };
    case "tracks": {
      const tracks = parseTracks(msg.tracks);
      return tracks ? { t: "tracks", tracks } : null;
    }
    case "media":
      return isBool(msg.audioOn) && isBool(msg.videoOn) && isBool(msg.screenOn)
        ? { t: "media", audioOn: msg.audioOn, videoOn: msg.videoOn, screenOn: msg.screenOn }
        : null;
    case "hand":
      return isBool(msg.raised) ? { t: "hand", raised: msg.raised } : null;
    case "reaction":
      return isReaction(msg.emoji) ? { t: "reaction", emoji: msg.emoji } : null;
    case "chat":
      return parseChat(msg);
    case "watch":
      return parseWatch(msg);
    case "mute":
      return isId(msg.uid) && (msg.kind === "audio" || msg.kind === "video")
        ? { t: "mute", uid: msg.uid, kind: msg.kind }
        : null;
    case "lowerHand":
      return isId(msg.uid) ? { t: "lowerHand", uid: msg.uid } : null;
    case "diag":
      return parseDiag(msg);
    default:
      return null;
  }
}

export function parseClientMessage(raw: string | ArrayBuffer): Parsed<MeetingClientMessage> {
  if (typeof raw !== "string") return { ok: false, error: "Binary messages are not supported." };
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
    return { ok: false, error: "Message is too large." };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Message is not valid JSON." };
  }
  const message = isObj(json) ? parseClientShape(json) : null;
  if (message?.t === "diag" && !isDiagWithinSize(raw)) return { ok: false, error: "Diagnostics are too large." };
  return message ? { ok: true, value: message } : { ok: false, error: "Unknown or malformed message." };
}

function isSettings(value: unknown): value is { quickAccess: boolean; notesEnabled: boolean } {
  return isObj(value) && isBool(value.quickAccess) && isBool(value.notesEnabled);
}

export function parseRoomEvent(json: unknown): Parsed<MeetingRoomEvent> {
  if (!isObj(json)) return { ok: false, error: "Event must be an object." };
  const event = ((): MeetingRoomEvent | null => {
    switch (json.t) {
      case "admitted":
      case "denied":
        return isId(json.uid) ? { t: json.t, uid: json.uid } : null;
      case "removed":
        return isId(json.uid) && isEpoch(json.at) ? { t: "removed", uid: json.uid, at: json.at } : null;
      case "rekey":
        return isEpoch(json.epoch) ? { t: "rekey", epoch: json.epoch } : null;
      case "settings":
        return isSettings(json.settings)
          ? { t: "settings", settings: { quickAccess: json.settings.quickAccess, notesEnabled: json.settings.notesEnabled } }
          : null;
      case "agenda":
        return isEpoch(json.version) ? { t: "agenda", version: json.version } : null;
      case "ended":
        return { t: "ended" };
      default:
        return null;
    }
  })();
  return event ? { ok: true, value: event } : { ok: false, error: "Unknown or malformed event." };
}
