import { describe, expect, it } from "vitest";
import { afterHostLeft } from "../src/host-handoff";
import { corsHeaders, roomTicketFromRequest } from "../src/http";
import {
  HOST_REPORT_RETRY_MS,
  checkTicket,
  endedState,
  initialState,
  joinParticipant,
  nextAlarm,
  pruneGhosts,
  reopenedState,
  ticketFromPayload,
  withPendingHostReport,
  withoutPendingHostReport,
  type RoomState
} from "../src/room-state";
import { host, member, sage, scribe } from "./fixtures";

function live(): RoomState {
  let state = initialState("m1");
  for (const [ticket, at] of [[host, 10], [member, 20], [sage, 30], [scribe, 5]] as const) state = joinParticipant(state, ticket, at).state;
  return state;
}

describe("generations: an automatically ended meeting can be reopened, End stays final", () => {
  it("rejects every ticket of the ended generation, older ones always", () => {
    const ended = endedState({ ...live(), generation: 2, epoch: 7 }, 1_000);
    expect(ended).toMatchObject({ endedAt: 1_000, generation: 2, epoch: 7 });
    expect(checkTicket(ended, { uid: "u", iat: 5_000, gen: 2 })).toEqual({ ok: false, reason: "ended" });
    expect(checkTicket(ended, { uid: "u", iat: 5_000, gen: 1 })).toEqual({ ok: false, reason: "ended" });
    expect(checkTicket({ ...ended, endedAt: null }, { uid: "u", iat: 5_000 })).toEqual({ ok: false, reason: "ended" });
  });

  it("a newer generation's ticket reopens a fresh room (epoch kept, lobby/participants/removals cleared)", () => {
    const ended = endedState({ ...live(), generation: 0, epoch: 3, removedAt: { "u-x": 50 } }, 1_000);
    expect(checkTicket(ended, { uid: "u", iat: 2_000, gen: 1 })).toEqual({ ok: true, reopens: true });
    const fresh = reopenedState(ended, 1);
    expect(fresh).toMatchObject({ generation: 1, epoch: 3, endedAt: null, participants: {}, removedAt: {}, started: false });
    expect(checkTicket(fresh, { uid: "u", iat: 2_000, gen: 1 })).toEqual({ ok: true });
  });

  it("tickets without gen are generation 0 (unchanged behaviour)", () => {
    expect(checkTicket(initialState("m1"), { uid: "u", iat: 1 })).toEqual({ ok: true });
    expect(ticketFromPayload({ uid: "u", name: "U", role: "member", adm: true, iat: 1, gen: 3 }).gen).toBe(3);
    expect(ticketFromPayload({ uid: "u", name: "U", role: "member", adm: true, iat: 1 })).not.toHaveProperty("gen");
  });
});

describe("ghost participants", () => {
  it("drops people with no open socket and reports whether a host was among them", () => {
    const pruned = pruneGhosts(live(), { admitted: new Set([member.uid, scribe.uid]), waiting: new Set() }, 100);
    expect(pruned.left.sort()).toEqual([host.uid, sage.uid].sort());
    expect(pruned.hostLeft).toBe(true);
    expect(Object.keys(pruned.state.participants).sort()).toEqual([member.uid, scribe.uid].sort());
    // The host is gone: the handoff grace is armed (folded into the one alarm).
    const handoff = afterHostLeft(pruned.state, false, 100);
    expect(handoff.state.handoffAt).not.toBeNull();
  });

  it("everyone gone (e.g. after a deploy) starts the empty-room timer", () => {
    const pruned = pruneGhosts(live(), { admitted: new Set(), waiting: new Set() }, 500);
    expect(pruned.state.emptySince).toBe(500);
    expect(nextAlarm(pruned.state)).not.toBeNull();
  });

  it("changes nothing when every participant has a socket", () => {
    const state = live();
    const all = new Set(Object.keys(state.participants));
    expect(pruneGhosts(state, { admitted: all, waiting: new Set() }, 1).state).toBe(state);
  });
});

describe("hostPromoted retries", () => {
  it("keeps unrecorded promotions and arms the one alarm", () => {
    const pending = withPendingHostReport(live(), member.uid, 1_000);
    expect(pending.pendingHostReports).toEqual([member.uid]);
    expect(pending.hostReportRetryAt).toBe(1_000 + HOST_REPORT_RETRY_MS);
    expect(nextAlarm(pending)).toBe(1_000 + HOST_REPORT_RETRY_MS);
    const done = withoutPendingHostReport(pending, member.uid);
    expect(done).toMatchObject({ pendingHostReports: [], hostReportRetryAt: null });
    expect(nextAlarm(done)).toBeNull();
  });
});

describe("room tickets on partytracks requests", () => {
  const url = "https://meet-room.example.edu/rooms/m1/partytracks/sessions/new?token=QUERY";
  it("prefers Authorization: Bearer, falls back to ?token=", () => {
    expect(roomTicketFromRequest(new Request(url, { headers: { Authorization: "Bearer HEADER" } }))).toBe("HEADER");
    expect(roomTicketFromRequest(new Request(url))).toBe("QUERY");
    expect(roomTicketFromRequest(new Request("https://meet-room.example.edu/x"))).toBe("");
  });

  it("allows the Authorization header in CORS", () => {
    expect(corsHeaders("https://portal.example.edu")["Access-Control-Allow-Headers"]).toContain("Authorization");
  });
});
