/**
 * Pure room state for one meeting. Every function returns a new state; nothing mutates.
 * The Durable Object persists this object as a single storage value.
 */
import {
  MEETING_EMPTY_END_MS,
  type MeetingParticipantView,
  type MeetingRoomEvent,
  type MeetingRoomSettings,
  type MeetingWaitingView,
  type MeetingWatchState
} from "../../../src/lib/meetings/protocol";
import type { MeetingRoomRole } from "../../../src/lib/meetings/room-token";

/** The parts of a verified room ticket the room keeps per socket. */
export type RoomTicket = {
  uid: string;
  name: string;
  role: MeetingRoomRole;
  adm: boolean;
  /** Exec (EP, adviser, super admin): first in line when host is handed over. */
  exec?: boolean;
  /** Room generation the ticket was issued for (absent = 0); see checkTicket. */
  gen?: number;
  iat: number;
};

export type RoomState = {
  meetingId: string | null;
  participants: Readonly<Record<string, MeetingParticipantView>>;
  waiting: Readonly<Record<string, MeetingWaitingView>>;
  settings: MeetingRoomSettings;
  /** uid -> epoch ms of the latest removal. Tickets issued before it are rejected. */
  removedAt: Readonly<Record<string, number>>;
  /** Realtime session id -> owner uid. */
  sessions: Readonly<Record<string, string>>;
  /** A human has been admitted at least once (the `started` report went out). */
  started: boolean;
  epoch: number;
  /** When the room last became empty of humans (after it started); null while humans are present. */
  emptySince: number | null;
  /** Set when the Portal ended the meeting. Every later ticket is rejected. */
  endedAt: number | null;
  /** uids made host by a handoff (they keep it for the rest of the meeting, even after a refresh). */
  promotedHosts: Readonly<Record<string, true>>;
  /** uids whose ticket said `exec` (preferred when host is handed over). */
  execUids: Readonly<Record<string, true>>;
  /** When to hand host over after the last host dropped without `leave`; null when not pending. */
  handoffAt: number | null;
  /** Failed `empty` reports so far, and when to try again (backoff); reset once humans return. */
  emptyReportFailures: number;
  emptyRetryAt: number | null;
  /** Room generation (Meeting.roomGeneration): a reopened meeting runs a newer one. */
  generation: number;
  /** Promoted hosts the Portal hasn't recorded yet (report failed), and when to try again. */
  pendingHostReports: readonly string[];
  hostReportRetryAt: number | null;
  /** Watch together in progress; null when nobody is watching a cut. */
  watch: MeetingWatchState | null;
};

export const DEFAULT_SETTINGS: MeetingRoomSettings = { quickAccess: false, notesEnabled: true };

export function initialState(meetingId: string | null = null): RoomState {
  return {
    meetingId,
    participants: {},
    waiting: {},
    settings: DEFAULT_SETTINGS,
    removedAt: {},
    sessions: {},
    started: false,
    epoch: 0,
    emptySince: null,
    endedAt: null,
    promotedHosts: {},
    execUids: {},
    handoffAt: null,
    emptyReportFailures: 0,
    emptyRetryAt: null,
    generation: 0,
    pendingHostReports: [],
    hostReportRetryAt: null,
    watch: null
  };
}

/** A stored state from before a field existed gets that field's default. */
export function normalizeState(stored: Partial<RoomState> | undefined | null): RoomState {
  return { ...initialState(), ...(stored ?? {}) };
}

/** The ticket's role says host, or the room handed host to this uid. */
export function isEffectiveHost(state: RoomState, ticket: Pick<RoomTicket, "uid" | "role">): boolean {
  return ticket.role === "host" || Boolean(state.promotedHosts[ticket.uid]);
}

export function withMeetingId(state: RoomState, meetingId: string): RoomState {
  return state.meetingId === meetingId ? state : { ...state, meetingId };
}

function omit<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

export type TicketCheck = { ok: true; reopens?: true } | { ok: false; reason: "ended" | "removed" };

/**
 * A ticket of an older generation belongs to a run that is over. A newer one means the Portal
 * reopened the meeting: it starts a fresh room (`reopens`), even if this room was ended.
 */
export function checkTicket(state: RoomState, ticket: Pick<RoomTicket, "uid" | "iat" | "gen">): TicketCheck {
  const gen = ticket.gen ?? 0;
  if (gen < state.generation) return { ok: false, reason: "ended" };
  if (gen > state.generation) return { ok: true, reopens: true };
  if (state.endedAt !== null) return { ok: false, reason: "ended" };
  const removedAt = state.removedAt[ticket.uid];
  if (removedAt !== undefined && ticket.iat < removedAt) return { ok: false, reason: "removed" };
  return { ok: true };
}

export function humanCount(state: RoomState): number {
  return Object.values(state.participants).filter((view) => !view.isScribe).length;
}

/** Recomputes `emptySince` after people come or go. */
function syncEmpty(state: RoomState, now: number): RoomState {
  const empty = state.started && humanCount(state) === 0;
  if (!empty) {
    return state.emptySince === null ? state : { ...state, emptySince: null, emptyReportFailures: 0, emptyRetryAt: null };
  }
  return state.emptySince === null ? { ...state, emptySince: now } : state;
}

function newParticipantView(state: RoomState, ticket: RoomTicket, now: number): MeetingParticipantView {
  return {
    uid: ticket.uid,
    name: ticket.name,
    isHost: isEffectiveHost(state, ticket),
    isScribe: ticket.role === "scribe",
    audioOn: false,
    videoOn: false,
    screenOn: false,
    handRaisedAt: null,
    tracks: {},
    joinedAt: now
  };
}

/**
 * An admitted ticket connected. A second tab of the same uid keeps the existing view (upgraded to
 * host if this ticket is one). A host arriving cancels a pending handoff.
 */
export function joinParticipant(
  state: RoomState,
  ticket: RoomTicket,
  now: number
): { state: RoomState; reportStarted: boolean } {
  const human = ticket.role !== "scribe";
  const existing = state.participants[ticket.uid];
  const host = isEffectiveHost(state, ticket);
  const view = existing ? (host && !existing.isHost ? { ...existing, isHost: true } : existing) : newParticipantView(state, ticket, now);
  const next: RoomState = {
    ...state,
    participants: { ...state.participants, [ticket.uid]: view },
    waiting: omit(state.waiting, ticket.uid),
    started: state.started || human,
    execUids: ticket.exec ? { ...state.execUids, [ticket.uid]: true } : state.execUids,
    handoffAt: view.isHost ? null : state.handoffAt
  };
  return { state: syncEmpty(next, now), reportStarted: human && !state.started };
}

/** A waiting (adm:false) ticket connected. `isNew` drives the knock report. */
export function joinWaiting(state: RoomState, ticket: RoomTicket, now: number): { state: RoomState; isNew: boolean } {
  if (state.waiting[ticket.uid]) return { state, isNew: false };
  const entry: MeetingWaitingView = { uid: ticket.uid, name: ticket.name, since: now };
  return { state: { ...state, waiting: { ...state.waiting, [ticket.uid]: entry } }, isNew: true };
}

function withoutSessionsOf(sessions: RoomState["sessions"], uid: string): Record<string, string> {
  return Object.fromEntries(Object.entries(sessions).filter(([, owner]) => owner !== uid));
}

/** The last admitted socket of `uid` closed: drop their view and their media sessions. */
export function leaveParticipant(state: RoomState, uid: string, now: number): { state: RoomState; left: boolean } {
  if (!state.participants[uid]) return { state, left: false };
  const next: RoomState = {
    ...state,
    participants: omit(state.participants, uid),
    sessions: withoutSessionsOf(state.sessions, uid)
  };
  return { state: syncEmpty(next, now), left: true };
}

/** Bounds on the stored state (one storage value): see also MAX_ROOM_SESSIONS in media-auth. */
export const MAX_PARTICIPANTS = 100;
export const MAX_WAITING = 100;

/** True when a new uid would push the participant or waiting list past its cap. */
export function isRoomFull(state: RoomState, ticket: Pick<RoomTicket, "uid" | "adm">): boolean {
  if (ticket.adm) return !state.participants[ticket.uid] && Object.keys(state.participants).length >= MAX_PARTICIPANTS;
  return !state.waiting[ticket.uid] && Object.keys(state.waiting).length >= MAX_WAITING;
}

/** The last waiting socket of `uid` closed. */
export function leaveWaiting(state: RoomState, uid: string): { state: RoomState; changed: boolean } {
  if (!state.waiting[uid]) return { state, changed: false };
  return { state: { ...state, waiting: omit(state.waiting, uid) }, changed: true };
}

/**
 * Records a new media session for `uid`. Sessions from dead tabs/reconnects are not always pruned
 * (a reconnect's new socket can open before the old one's close lands), so instead of refusing the
 * newest session past `maxPerUid`, the uid's OLDEST sessions are evicted (object keys keep
 * insertion order). A newer session always works; a stale tab loses its media.
 */
export function registerSession(state: RoomState, sessionId: string, uid: string, maxPerUid = Infinity): RoomState {
  if (state.sessions[sessionId] === uid) return state;
  const sessions: Record<string, string> = { ...state.sessions, [sessionId]: uid };
  const mine = Object.keys(sessions).filter((sid) => sessions[sid] === uid);
  for (const stale of mine.slice(0, Math.max(0, mine.length - maxPerUid))) delete sessions[stale];
  return { ...state, sessions };
}

function removeUser(state: RoomState, uid: string, at: number, now: number): RoomState {
  const next: RoomState = {
    ...state,
    participants: omit(state.participants, uid),
    waiting: omit(state.waiting, uid),
    sessions: withoutSessionsOf(state.sessions, uid),
    removedAt: { ...state.removedAt, [uid]: Math.max(state.removedAt[uid] ?? 0, at) },
    promotedHosts: omit(state.promotedHosts, uid)
  };
  return syncEmpty(next, now);
}

/** Applies a Portal -> room event to the stored state (socket side effects live in the DO). */
export function applyRoomEvent(state: RoomState, event: MeetingRoomEvent, now: number): RoomState {
  switch (event.t) {
    case "admitted":
    case "denied":
      return leaveWaiting(state, event.uid).state;
    case "removed":
      return removeUser(state, event.uid, event.at, now);
    case "rekey":
      return { ...state, epoch: event.epoch };
    case "settings":
      return { ...state, settings: event.settings };
    case "agenda":
      // Nothing stored: the agenda lives in the Portal; the DO only fans the change out.
      return state;
    case "ended":
      return endedState(state, now);
  }
}

/** When the `empty` alarm should fire, or null when no alarm is needed. */
export function emptyDeadline(state: RoomState): number | null {
  if (state.endedAt !== null || !state.started || state.emptySince === null) return null;
  if (humanCount(state) > 0) return null;
  return state.emptyRetryAt ?? state.emptySince + MEETING_EMPTY_END_MS;
}

/** `empty` report retries: 1, 2, 4, 8, 16, 32 minutes (about an hour in all), then give up. */
export const EMPTY_REPORT_FIRST_RETRY_MS = 60_000;
export const EMPTY_REPORT_MAX_RETRIES = 6;

/**
 * The Portal didn't take the `empty` report. 404/410 (meeting unknown or deleted) or too many
 * failures: give up, and the caller clears the room. Otherwise retry later with backoff.
 */
export function afterEmptyReportFailed(
  state: RoomState,
  status: number | null,
  now: number
): { state: RoomState; giveUp: boolean } {
  if (status === 404 || status === 410) return { state, giveUp: true };
  const failures = state.emptyReportFailures + 1;
  if (failures > EMPTY_REPORT_MAX_RETRIES) return { state, giveUp: true };
  const delay = EMPTY_REPORT_FIRST_RETRY_MS * 2 ** (failures - 1);
  return { state: { ...state, emptyReportFailures: failures, emptyRetryAt: now + delay }, giveUp: false };
}

/** What the room becomes once ended (by the Portal, or given up on): later tickets of this generation are rejected. */
export function endedState(state: RoomState, now: number): RoomState {
  return { ...initialState(state.meetingId), endedAt: now, generation: state.generation, epoch: state.epoch };
}

/** A fresh room for a reopened meeting (a ticket of generation `gen`); the key epoch only moves forward. */
export function reopenedState(state: RoomState, gen: number): RoomState {
  return { ...initialState(state.meetingId), generation: gen, epoch: state.epoch };
}

/**
 * Participants and lobby entries with no open socket (e.g. after a Worker restart or deploy, when
 * close handlers never ran) are dropped. Returns who left and whether a host was among them.
 */
export function pruneGhosts(
  state: RoomState,
  live: { admitted: ReadonlySet<string>; waiting: ReadonlySet<string> },
  now: number
): { state: RoomState; left: string[]; hostLeft: boolean } {
  let next = state;
  const left: string[] = [];
  let hostLeft = false;
  for (const uid of Object.keys(state.participants)) {
    if (live.admitted.has(uid)) continue;
    hostLeft = hostLeft || Boolean(state.participants[uid]?.isHost);
    next = leaveParticipant(next, uid, now).state;
    left.push(uid);
  }
  for (const uid of Object.keys(state.waiting)) {
    if (!live.waiting.has(uid)) next = leaveWaiting(next, uid).state;
  }
  return { state: next, left, hostLeft };
}

/** hostPromoted report retries: every minute until the Portal records it (or the uid isn't promoted any more). */
export const HOST_REPORT_RETRY_MS = 60_000;

export function withPendingHostReport(state: RoomState, uid: string, now: number): RoomState {
  const pending = state.pendingHostReports.includes(uid) ? state.pendingHostReports : [...state.pendingHostReports, uid];
  return { ...state, pendingHostReports: pending, hostReportRetryAt: now + HOST_REPORT_RETRY_MS };
}

export function withoutPendingHostReport(state: RoomState, uid: string): RoomState {
  const pending = state.pendingHostReports.filter((entry) => entry !== uid);
  return { ...state, pendingHostReports: pending, hostReportRetryAt: pending.length > 0 ? state.hostReportRetryAt : null };
}

/** One alarm serves every deadline: the empty-room end, the host handoff and hostPromoted retries. */
export function nextAlarm(state: RoomState): number | null {
  const live = state.endedAt === null;
  const deadlines = [emptyDeadline(state), live ? state.handoffAt : null, live ? state.hostReportRetryAt : null].filter(
    (value): value is number => value !== null
  );
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

export function isEmptyDue(state: RoomState, now: number): boolean {
  const deadline = emptyDeadline(state);
  return deadline !== null && now >= deadline;
}

export function waitingList(state: RoomState): MeetingWaitingView[] {
  return Object.values(state.waiting).sort((a, b) => a.since - b.since);
}

export function participantList(state: RoomState): MeetingParticipantView[] {
  return Object.values(state.participants).sort((a, b) => a.joinedAt - b.joinedAt);
}

export function ticketFromPayload(payload: {
  uid: string;
  name: string;
  role: MeetingRoomRole;
  adm: boolean;
  exec?: boolean;
  gen?: number;
  iat: number;
}): RoomTicket {
  return {
    uid: payload.uid,
    name: payload.name,
    role: payload.role,
    adm: payload.adm,
    ...(payload.exec ? { exec: true } : {}),
    ...(payload.gen ? { gen: payload.gen } : {}),
    iat: payload.iat
  };
}
