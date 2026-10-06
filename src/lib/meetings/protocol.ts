/**
 * Meetings room protocol: JSON messages over the meeting-room Worker WebSocket
 * (wss://<MEETING_ROOM_URL host>/rooms/<meetingId>/ws?token=<room token>).
 * Shared by the Worker (Durable Object), the call UI and the Scribe page. Types only.
 *
 * Privacy: chat text travels as AES-GCM ciphertext under the meeting key (the room never
 * sees it). Presence, hands, reactions and mute state are plain metadata.
 */

/** Cloudflare Realtime track handle, as partytracks emits it from push(). */
export type MeetingTrackMetadata = {
  location?: "local" | "remote";
  sessionId?: string;
  trackName?: string;
  mid?: string | null;
};

export type MeetingTrackKind = "audio" | "video" | "screen" | "screenAudio";

export type MeetingTracks = Partial<Record<MeetingTrackKind, MeetingTrackMetadata>>;

export const MEETING_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "👏", "🤔"] as const;
export type MeetingReaction = (typeof MEETING_REACTIONS)[number];

export type MeetingParticipantView = {
  uid: string;
  name: string;
  isHost: boolean;
  isScribe: boolean;
  audioOn: boolean;
  videoOn: boolean;
  screenOn: boolean;
  /** Epoch ms the hand went up; null when lowered. Order of the hand queue. */
  handRaisedAt: number | null;
  tracks: MeetingTracks;
  joinedAt: number;
};

export type MeetingWaitingView = { uid: string; name: string; since: number };

export type MeetingRoomSettings = {
  /** Producers join without knocking. */
  quickAccess: boolean;
  /** Scribe takes notes (transcript + summary on the Drive). */
  notesEnabled: boolean;
};

/**
 * Watch together: one package cut that everyone plays on their own device (straight from the
 * Drive), kept in step by the room. The room only sees opaque ids and timing; titles come from
 * the Portal (GET /api/meetings/cuts/<versionId>).
 */
export type MeetingWatchAction = "start" | "play" | "pause" | "seek";

export type MeetingWatchState = {
  /** New for every start: play/pause/seek/stop naming an older id are refused. */
  id: string;
  mediaId: string;
  versionId: string;
  playing: boolean;
  /** Seconds into the video at `at`. */
  position: number;
  /** Room clock (epoch ms) of the last change. A start is in the future: it plays after a short lead. */
  at: number;
  /** Who made the last change, and what it was ("Paused by …"). */
  by: string;
  byName: string;
  action: MeetingWatchAction;
};

/** A start plays this long after the room takes it, so every device has time to load. */
export const MEETING_WATCH_START_LEAD_MS = 2000;
/** Longest position the room accepts (seconds). */
export const MEETING_WATCH_MAX_SECONDS = 4 * 60 * 60;

/** Encrypted chat body: AES-GCM over UTF-8 JSON {text}, key derived from the meeting key (info "chat"). */
export type MeetingChatCiphertext = { ct: string; iv: string; epoch: number };

// ---------------------------------------------------------------------------
// Client -> room
// ---------------------------------------------------------------------------

/** `periodic`: the 10 s stats summary. `event`: something just happened (an error, a state change, a click). */
export type MeetingDiagKind = "periodic" | "event";
export type MeetingDiagData = Record<string, string | number | boolean | null>;
/** Largest `diag` message the room accepts (the whole JSON message, in bytes). */
export const MEETING_DIAG_MAX_BYTES = 2048;

export type MeetingClientMessage =
  | { t: "tracks"; tracks: MeetingTracks }
  | { t: "media"; audioOn: boolean; videoOn: boolean; screenOn: boolean }
  | { t: "hand"; raised: boolean }
  | { t: "reaction"; emoji: MeetingReaction }
  | ({ t: "chat"; id: string } & MeetingChatCiphertext)
  | { t: "ping" }
  /** Watch together (any admitted person; never the Scribe). */
  | { t: "watch"; action: "start"; mediaId: string; versionId: string }
  | { t: "watch"; action: "play" | "pause" | "seek"; id: string; position: number }
  | { t: "watch"; action: "stop"; id: string }
  /** Deliberate leave (sent just before closing): if the last host leaves, host passes on at once. */
  | { t: "leave" }
  /**
   * Call diagnostics for debugging (connection state, getStats summary, errors). The room logs it
   * to Workers Logs and never fans it out. Flat primitives only, at most MEETING_DIAG_MAX_BYTES.
   */
  | { t: "diag"; kind: MeetingDiagKind; data: MeetingDiagData }
  // Host only:
  | { t: "mute"; uid: string; kind: "audio" | "video" }
  | { t: "muteAll" }
  | { t: "lowerHand"; uid: string }
  | { t: "lowerAllHands" };

// ---------------------------------------------------------------------------
// Room -> client
// ---------------------------------------------------------------------------

export type MeetingServerMessage =
  /** First message after connect. `waiting` is only filled for hosts. */
  | {
      t: "welcome";
      self: { uid: string; admitted: boolean; isHost: boolean };
      participants: MeetingParticipantView[];
      waiting: MeetingWaitingView[];
      settings: MeetingRoomSettings;
      epoch: number;
      /** Watch together in progress (admitted only). Optional: an older room doesn't send it. */
      watch?: MeetingWatchState | null;
      /** Room clock (epoch ms) when this was sent, for watch-together timing. */
      now?: number;
    }
  | { t: "participant"; participant: MeetingParticipantView }
  | { t: "left"; uid: string }
  | { t: "waiting"; waiting: MeetingWaitingView[] }
  /** You were let in: fetch the key from the Portal, then publish. */
  | { t: "admitted" }
  | { t: "denied" }
  | { t: "removed" }
  /** The meeting key changed (someone was removed). Fetch the new key from the Portal. */
  | { t: "rekey"; epoch: number }
  | { t: "settings"; settings: MeetingRoomSettings }
  /** The meeting agenda changed in the Portal: refetch GET /api/meetings/<id>/agenda. Not E2EE (Portal data). */
  | { t: "agenda"; version: number }
  | { t: "muted"; kind: "audio" | "video"; by: string }
  /** Your host status changed (host handed to you). Other people see it on your `participant` view. */
  | { t: "role"; isHost: boolean }
  | { t: "reaction"; uid: string; emoji: MeetingReaction; at: number }
  /** Watch together changed (null: stopped). `now` is the room clock when it was sent. */
  | { t: "watch"; watch: MeetingWatchState | null; now: number }
  | ({ t: "chat"; id: string; uid: string; name: string; at: number } & MeetingChatCiphertext)
  | { t: "ended" }
  | { t: "pong" }
  | { t: "error"; message: string };

// ---------------------------------------------------------------------------
// Portal -> room (POST /internal/rooms/<meetingId>/events, Bearer internal token from "portal")
// ---------------------------------------------------------------------------

export type MeetingRoomEvent =
  | { t: "admitted"; uid: string }
  | { t: "denied"; uid: string }
  /** Removal: close their socket, drop their tracks, reject tickets issued before `at`. */
  | { t: "removed"; uid: string; at: number }
  | { t: "rekey"; epoch: number }
  | { t: "settings"; settings: MeetingRoomSettings }
  /** Agenda changed (version = change time, epoch ms); fanned out to admitted sockets as-is. */
  | { t: "agenda"; version: number }
  | { t: "ended" };

// ---------------------------------------------------------------------------
// Room -> Portal (POST <PORTAL_BASE_URL>/api/service/meetings/<meetingId>/room, Bearer internal token from "room")
// ---------------------------------------------------------------------------

export type MeetingRoomReport =
  /** First human admitted into an empty room. */
  | { t: "started" }
  /** Someone knocked (so the Portal can push hosts who are not in the call). */
  | { t: "knock"; uid: string; name: string }
  /** No humans for MEETING_EMPTY_END_MS. */
  | { t: "empty" }
  /** The last host left; the room made `uid` a host (next exec, else the longest-present producer). */
  | { t: "hostPromoted"; uid: string };

/** A host whose connection drops (no `leave`) keeps host for this long before it is handed over. */
export const MEETING_HOST_HANDOFF_GRACE_MS = 20 * 1000;

/** The meeting ends once the last person leaves; the grace covers a refresh or a dropped connection. */
export const MEETING_EMPTY_END_MS = 60 * 1000;
