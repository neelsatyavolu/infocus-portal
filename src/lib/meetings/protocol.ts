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

/** Encrypted chat body: AES-GCM over UTF-8 JSON {text}, key derived from the meeting key (info "chat"). */
export type MeetingChatCiphertext = { ct: string; iv: string; epoch: number };

// ---------------------------------------------------------------------------
// Client -> room
// ---------------------------------------------------------------------------

export type MeetingClientMessage =
  | { t: "tracks"; tracks: MeetingTracks }
  | { t: "media"; audioOn: boolean; videoOn: boolean; screenOn: boolean }
  | { t: "hand"; raised: boolean }
  | { t: "reaction"; emoji: MeetingReaction }
  | ({ t: "chat"; id: string } & MeetingChatCiphertext)
  | { t: "ping" }
  /** Deliberate leave (sent just before closing): if the last host leaves, host passes on at once. */
  | { t: "leave" }
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
  | { t: "muted"; kind: "audio" | "video"; by: string }
  /** Your host status changed (host handed to you). Other people see it on your `participant` view. */
  | { t: "role"; isHost: boolean }
  | { t: "reaction"; uid: string; emoji: MeetingReaction; at: number }
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
