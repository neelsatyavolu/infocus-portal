/**
 * Meetings API response shapes (Portal backend → Meetings tab, call UI and Scribe page).
 * All dates are ISO strings. Every response is wrapped in the usual `{ data }` envelope.
 */

export type MeetingStatusValue = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED";
export type MeetingNotesStatusValue = "NONE" | "RECORDING" | "PROCESSING" | "READY" | "FAILED";
export type MeetingParticipantStateValue = "WAITING" | "ADMITTED" | "DENIED" | "REMOVED";
/** OPEN: any producer. INVITE_ONLY (execs create): only the creator and the invitees. */
export type MeetingAccessValue = "OPEN" | "INVITE_ONLY";

export type MeetingPerson = { id: string; name: string };

export type MeetingSummary = {
  id: string;
  title: string;
  startsAt: string;
  /** /join opens 5 minutes before startsAt while SCHEDULED (LIVE meetings are always joinable). */
  joinOpensAt: string;
  durationMinutes: number;
  status: MeetingStatusValue;
  access: MeetingAccessValue;
  /** OPEN: who gets the start push (0 = all producers). INVITE_ONLY: producers allowed in besides the creator. */
  inviteeCount: number;
  /** "producers" for the default recurring series; null for one-off meetings. */
  seriesKey: string | null;
  /** The viewer is a host (exec, adviser, super admin, or the meeting's creator). */
  isHost: boolean;
  /** The viewer may move, cancel or change settings (host and the meeting is not over). */
  canEdit: boolean;
  notesEnabled: boolean;
  quickAccess: boolean;
  notesStatus: MeetingNotesStatusValue;
  /** People who were let in (admitted, including anyone later removed). */
  participantCount: number;
  createdByName: string | null;
};

export type MeetingDetail = MeetingSummary & {
  notesSummary: string | null;
  invitees: MeetingPerson[];
  hasTranscript: boolean;
  startedAt: string | null;
  endedAt: string | null;
};

/** GET /api/meetings */
export type MeetingListResponse = {
  live: MeetingSummary[];
  upcoming: MeetingSummary[];
  past: MeetingSummary[];
  /** The viewer is an exec and may create INVITE_ONLY meetings. */
  canCreateInviteOnly: boolean;
};

/** GET /api/meetings/people: every producer, for the invitee picker. */
export type MeetingPeopleResponse = { people: MeetingPerson[] };

/** GET /api/meetings/[id]/key, and `key` in JoinResponse. `key` is the 32-byte meeting key, base64url. */
export type KeyResponse = { key: string; epoch: number };

/** POST /api/meetings/[id]/join */
export type JoinResponse = {
  /** Meeting-room Worker origin, e.g. https://meet.example.edu (append /rooms/<id>/ws). */
  roomUrl: string;
  /** Room ticket (see src/lib/meetings/room-token.ts). `adm` matches `state`. */
  roomToken: string;
  state: "WAITING" | "ADMITTED";
  isHost: boolean;
  meeting: MeetingSummary;
  /** Only when ADMITTED. */
  key?: KeyResponse;
  self: { uid: string; name: string };
};

/** GET /api/meetings/[id]/transcript */
export type MeetingTranscriptResponse = { markdown: string };

/** GET /api/meetings/series/producers/current */
export type MeetingSeriesCurrentResponse = { meeting: MeetingSummary };

/** An address that gets Producer meeting calendar invites. */
export type MeetingInviteEmailView = {
  id: string;
  email: string;
  name: string | null;
  /** The producer this address belongs to (invite-only meetings email only their people). */
  userId: string | null;
  userName: string | null;
  createdAt: string;
  /** When the address became a guest of the series' Google Calendar event (null: not synced yet). */
  lastInvitedAt: string | null;
};

/** GET /api/meetings/invites. `canManage`: the viewer is an exec (add, remove, link, sync). */
export type MeetingInviteListResponse = {
  invites: MeetingInviteEmailView[];
  canManage: boolean;
  /** Invites are Google Calendar events from this account. Not connected: none are sent. */
  calendar: {
    connected: boolean;
    accountEmail: string | null;
    lastSyncedAt: string | null;
    /** Short reason the last sync failed; null when it worked. */
    lastSyncError: string | null;
  };
};
