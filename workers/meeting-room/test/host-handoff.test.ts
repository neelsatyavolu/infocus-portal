import { describe, expect, it } from "vitest";
import { MEETING_EMPTY_END_MS, MEETING_HOST_HANDOFF_GRACE_MS } from "../../../src/lib/meetings/protocol";
import { afterHostLeft, isHandoffDue, pickNextHost, promoteNextHost } from "../src/host-handoff";
import { handleClientMessage } from "../src/room-messages";
import {
  initialState,
  isEffectiveHost,
  joinParticipant,
  leaveParticipant,
  nextAlarm,
  normalizeState,
  ticketFromPayload,
  type RoomState
} from "../src/room-state";
import { parseClientMessage } from "../src/validation";
import { host, member, sage, scribe, ticket } from "./fixtures";

/** Host Otto (t=10), member Abby (t=20), member Sage (t=30), Scribe (t=5). */
function room(): RoomState {
  let state = initialState("m1");
  state = joinParticipant(state, scribe, 5).state;
  state = joinParticipant(state, host, 10).state;
  state = joinParticipant(state, member, 20).state;
  state = joinParticipant(state, sage, 30).state;
  return state;
}

function hostLeaves(state: RoomState, deliberate: boolean, now = 100) {
  const left = leaveParticipant(state, host.uid, now).state;
  return afterHostLeft(left, deliberate, now);
}

describe("host handoff", () => {
  it("leave → hands host over at once, to the longest-present producer", () => {
    const { state, promoted } = hostLeaves(room(), true);
    expect(promoted).toBe(member.uid);
    expect(state.participants[member.uid]?.isHost).toBe(true);
    expect(state.promotedHosts[member.uid]).toBe(true);
    expect(state.handoffAt).toBeNull();
  });

  it("abrupt close → waits the grace, then promotes from the alarm", () => {
    const { state, promoted } = hostLeaves(room(), false, 100);
    expect(promoted).toBeNull();
    expect(state.handoffAt).toBe(100 + MEETING_HOST_HANDOFF_GRACE_MS);
    expect(nextAlarm(state)).toBe(100 + MEETING_HOST_HANDOFF_GRACE_MS);
    expect(isHandoffDue(state, 100 + MEETING_HOST_HANDOFF_GRACE_MS - 1)).toBe(false);
    expect(isHandoffDue(state, 100 + MEETING_HOST_HANDOFF_GRACE_MS)).toBe(true);
    expect(promoteNextHost(state).promoted).toBe(member.uid);
  });

  it("the host reconnecting within the grace cancels the handoff", () => {
    const pending = hostLeaves(room(), false, 100).state;
    const back = joinParticipant(pending, host, 5_000).state;
    expect(back.handoffAt).toBeNull();
    expect(isHandoffDue(back, 1_000_000)).toBe(false);
    expect(promoteNextHost(back).promoted).toBeNull();
  });

  it("prefers an exec, then the earliest join", () => {
    let state = room();
    state = joinParticipant(state, ticket({ uid: "u-exec", name: "Exec", exec: true }), 50).state;
    expect(pickNextHost(leaveParticipant(state, host.uid, 60).state)).toBe("u-exec");
    expect(pickNextHost(leaveParticipant(room(), host.uid, 60).state)).toBe(member.uid);
  });

  it("never promotes the Scribe; with only the Scribe left nobody is promoted", () => {
    let state = initialState("m1");
    state = joinParticipant(state, scribe, 5).state;
    state = joinParticipant(state, host, 10).state;
    const { state: after, promoted } = hostLeaves(state, true);
    expect(promoted).toBeNull();
    expect(after.participants.scribe?.isHost).toBe(false);
    expect(after.handoffAt).toBeNull();
  });

  it("does nothing while another host is still in the call", () => {
    let state = room();
    state = joinParticipant(state, ticket({ uid: "u-host2", name: "Host 2", role: "host" }), 40).state;
    expect(hostLeaves(state, false).state.handoffAt).toBeNull();
  });

  it("uses one alarm at the earliest of the empty-room end and the handoff", () => {
    const state = { ...room(), handoffAt: 900, emptySince: 0, participants: {} } as RoomState;
    expect(nextAlarm({ ...state, started: true })).toBe(Math.min(900, MEETING_EMPTY_END_MS));
    expect(nextAlarm({ ...initialState("m1"), handoffAt: 900 })).toBe(900);
  });

  it("a promoted host keeps host after a refresh with a member ticket", () => {
    const promotedState = hostLeaves(room(), true).state;
    const refreshed = leaveParticipant(promotedState, member.uid, 200).state;
    const back = joinParticipant(refreshed, member, 300).state;
    expect(back.participants[member.uid]?.isHost).toBe(true);
    expect(isEffectiveHost(back, member)).toBe(true);
  });
});

describe("host-only commands from a promoted host", () => {
  it("are refused before the handoff and accepted after it", () => {
    const before = room();
    expect(handleClientMessage(before, member, { t: "muteAll" }, 1)).toEqual({ kind: "error", message: "Only a host can do that." });
    const after = hostLeaves(before, true).state;
    expect(handleClientMessage(after, member, { t: "muteAll" }, 1)).toMatchObject({ kind: "muted" });
  });

  it("`leave` is accepted (even from the lobby) and parsed", () => {
    expect(parseClientMessage(JSON.stringify({ t: "leave" }))).toEqual({ ok: true, value: { t: "leave" } });
    expect(handleClientMessage(initialState(), ticket({ adm: false }), { t: "leave" }, 1)).toEqual({ kind: "leave" });
  });
});

describe("state and tickets", () => {
  it("old stored states get the new fields", () => {
    const old = { ...initialState("m1") } as Partial<RoomState>;
    delete old.promotedHosts;
    delete old.execUids;
    delete old.handoffAt;
    expect(normalizeState(old)).toMatchObject({ promotedHosts: {}, execUids: {}, handoffAt: null });
  });

  it("keeps the exec flag from the ticket", () => {
    const base = { uid: "u", name: "U", role: "member" as const, adm: true, iat: 1 };
    expect(ticketFromPayload({ ...base, exec: true }).exec).toBe(true);
    expect(ticketFromPayload(base)).not.toHaveProperty("exec");
  });
});
