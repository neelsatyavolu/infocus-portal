import { describe, expect, it } from "vitest";
import { MEETING_EMPTY_END_MS } from "../../../src/lib/meetings/protocol";
import {
  applyRoomEvent,
  checkTicket,
  emptyDeadline,
  initialState,
  isEmptyDue,
  isRoomFull,
  joinParticipant,
  joinWaiting,
  leaveParticipant,
  leaveWaiting,
  MAX_PARTICIPANTS,
  MAX_WAITING,
  registerSession
} from "../src/room-state";
import { host, knocker, member, scribe } from "./fixtures";

describe("admission and waiting", () => {
  it("adds admitted tickets as participants and reports started once", () => {
    const first = joinParticipant(initialState("m1"), host, 10);
    expect(first.reportStarted).toBe(true);
    expect(first.state.participants[host.uid]?.isHost).toBe(true);
    const second = joinParticipant(first.state, member, 20);
    expect(second.reportStarted).toBe(false);
    expect(Object.keys(second.state.participants)).toEqual([host.uid, member.uid]);
  });

  it("does not report started for the scribe alone", () => {
    const { state, reportStarted } = joinParticipant(initialState(), scribe, 10);
    expect(reportStarted).toBe(false);
    expect(state.started).toBe(false);
    expect(state.participants.scribe?.isScribe).toBe(true);
  });

  it("puts adm:false tickets on the waiting list once", () => {
    const first = joinWaiting(initialState(), knocker, 5);
    expect(first.isNew).toBe(true);
    const again = joinWaiting(first.state, knocker, 9);
    expect(again.isNew).toBe(false);
    expect(again.state.waiting[knocker.uid]?.since).toBe(5);
    expect(first.state.participants[knocker.uid]).toBeUndefined();
  });

  it("moves a knocker into the call when an admitted ticket connects", () => {
    const waiting = joinWaiting(initialState(), knocker, 5).state;
    const { state } = joinParticipant(waiting, { ...knocker, adm: true }, 9);
    expect(state.waiting[knocker.uid]).toBeUndefined();
    expect(state.participants[knocker.uid]).toBeDefined();
  });

  it("keeps the existing view when a second tab joins", () => {
    const one = joinParticipant(initialState(), member, 10).state;
    const two = joinParticipant(one, member, 50).state;
    expect(two.participants[member.uid]?.joinedAt).toBe(10);
  });

  it("admitted/denied events clear the waiting entry", () => {
    const waiting = joinWaiting(initialState(), knocker, 5).state;
    expect(applyRoomEvent(waiting, { t: "admitted", uid: knocker.uid }, 6).waiting).toEqual({});
    expect(applyRoomEvent(waiting, { t: "denied", uid: knocker.uid }, 6).waiting).toEqual({});
  });

  it("leaveWaiting is a no-op for unknown uids", () => {
    expect(leaveWaiting(initialState(), "nobody").changed).toBe(false);
  });

  it("does not mutate the input state", () => {
    const before = initialState();
    const frozen = Object.freeze({ ...before, participants: Object.freeze({}) });
    joinParticipant(frozen, member, 1);
    expect(frozen.participants).toEqual({});
  });
});

describe("removal", () => {
  const live = joinParticipant(joinParticipant(initialState(), host, 1).state, member, 2).state;
  const owned = registerSession(registerSession(live, "s-abby", member.uid), "s-otto", host.uid);
  const removed = applyRoomEvent(owned, { t: "removed", uid: member.uid, at: 2_000 }, 2_000);

  it("drops the participant and their sessions", () => {
    expect(removed.participants[member.uid]).toBeUndefined();
    expect(removed.sessions).toEqual({ "s-otto": host.uid });
  });

  it("rejects tickets issued before the removal and accepts newer ones", () => {
    expect(checkTicket(removed, { uid: member.uid, iat: 1_999 })).toEqual({ ok: false, reason: "removed" });
    expect(checkTicket(removed, { uid: member.uid, iat: 2_000 })).toEqual({ ok: true });
    expect(checkTicket(removed, { uid: host.uid, iat: 1 })).toEqual({ ok: true });
  });

  it("never moves removedAt backwards", () => {
    const older = applyRoomEvent(removed, { t: "removed", uid: member.uid, at: 500 }, 3_000);
    expect(older.removedAt[member.uid]).toBe(2_000);
  });
});

describe("events", () => {
  it("rekey and settings update state", () => {
    const rekeyed = applyRoomEvent(initialState(), { t: "rekey", epoch: 3 }, 1);
    expect(rekeyed.epoch).toBe(3);
    const settings = { quickAccess: true, notesEnabled: false };
    expect(applyRoomEvent(rekeyed, { t: "settings", settings }, 1).settings).toEqual(settings);
  });

  it("ended clears everything and rejects all later tickets", () => {
    const live = joinParticipant(initialState("m1"), host, 1).state;
    const ended = applyRoomEvent(live, { t: "ended" }, 99);
    expect(ended.participants).toEqual({});
    expect(ended.meetingId).toBe("m1");
    expect(checkTicket(ended, { uid: host.uid, iat: 1_000_000 })).toEqual({ ok: false, reason: "ended" });
  });
});

describe("empty detection", () => {
  it("arms only after a human has been in the room and everyone left", () => {
    const waitingOnly = joinWaiting(initialState(), knocker, 1).state;
    expect(emptyDeadline(waitingOnly)).toBeNull();

    const live = joinParticipant(initialState(), host, 1).state;
    expect(emptyDeadline(live)).toBeNull();

    const { state: empty, left } = leaveParticipant(live, host.uid, 100);
    expect(left).toBe(true);
    expect(emptyDeadline(empty)).toBe(100 + MEETING_EMPTY_END_MS);
    expect(isEmptyDue(empty, 100 + MEETING_EMPTY_END_MS - 1)).toBe(false);
    expect(isEmptyDue(empty, 100 + MEETING_EMPTY_END_MS)).toBe(true);
  });

  it("the scribe alone counts as empty", () => {
    const live = joinParticipant(joinParticipant(initialState(), host, 1).state, scribe, 2).state;
    const { state } = leaveParticipant(live, host.uid, 100);
    expect(emptyDeadline(state)).toBe(100 + MEETING_EMPTY_END_MS);
  });

  it("a human rejoining cancels the deadline", () => {
    const live = joinParticipant(initialState(), host, 1).state;
    const empty = leaveParticipant(live, host.uid, 100).state;
    const back = joinParticipant(empty, member, 200);
    expect(back.reportStarted).toBe(false);
    expect(emptyDeadline(back.state)).toBeNull();
  });

  it("leaving twice is a no-op", () => {
    const empty = leaveParticipant(joinParticipant(initialState(), host, 1).state, host.uid, 100).state;
    const again = leaveParticipant(empty, host.uid, 500);
    expect(again.left).toBe(false);
    expect(again.state.emptySince).toBe(100);
  });
});

describe("bounded state", () => {
  it("prunes a uid's sessions when their last socket leaves", () => {
    const live = joinParticipant(joinParticipant(initialState(), host, 1).state, member, 2).state;
    const owned = registerSession(registerSession(live, "s-abby", member.uid), "s-otto", host.uid);
    expect(leaveParticipant(owned, member.uid, 3).state.sessions).toEqual({ "s-otto": host.uid });
  });

  it("caps participants and waiting entries for new uids only", () => {
    const full = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => ({ ...member, uid: `u${i}` })).reduce(
      (state, t) => joinParticipant(state, t, 1).state,
      initialState()
    );
    expect(isRoomFull(full, { uid: "new", adm: true })).toBe(true);
    expect(isRoomFull(full, { uid: "u0", adm: true })).toBe(false);
    const queue = Array.from({ length: MAX_WAITING }, (_, i) => ({ ...knocker, uid: `w${i}` })).reduce(
      (state, t) => joinWaiting(state, t, 1).state,
      initialState()
    );
    expect(isRoomFull(queue, { uid: "new", adm: false })).toBe(true);
    expect(isRoomFull(queue, { uid: "new", adm: true })).toBe(false);
  });
});
