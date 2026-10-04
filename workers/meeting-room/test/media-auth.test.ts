import { describe, expect, it } from "vitest";
import {
  authorizeMedia,
  canRegisterSession,
  classifyPartyTracksPath,
  MAX_ROOM_SESSIONS,
  MAX_SESSIONS_PER_UID
} from "../src/media-auth";
import { applyRoomEvent, initialState, joinParticipant, leaveParticipant, registerSession, type RoomState } from "../src/room-state";
import { host, knocker, member, scribe } from "./fixtures";

const inRoom = [host, member, scribe].reduce((state, t, i) => joinParticipant(state, t, i).state, initialState("m1"));
const owned = registerSession(registerSession(registerSession(inRoom, "s-abby", member.uid), "s-otto", host.uid), "s-scribe", scribe.uid);

function withSessions(state: RoomState, uid: string, count: number, prefix = uid): RoomState {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`).reduce((acc, sid) => registerSession(acc, sid, uid), state);
}

describe("classifyPartyTracksPath", () => {
  it("allows only the partytracks client paths", () => {
    expect(classifyPartyTracksPath("/generate-ice-servers")).toEqual({ kind: "ice" });
    expect(classifyPartyTracksPath("/sessions/new")).toEqual({ kind: "newSession" });
    expect(classifyPartyTracksPath("/sessions/abc/tracks/new")).toEqual({ kind: "session", sessionId: "abc", action: "tracks/new" });
    expect(classifyPartyTracksPath("/sessions/abc/renegotiate")?.kind).toBe("session");
    expect(classifyPartyTracksPath("/sessions/abc")).toBeNull();
    expect(classifyPartyTracksPath("/sessions/abc/delete")).toBeNull();
    expect(classifyPartyTracksPath("/sessions/../apps/tracks/new")).toBeNull();
  });
});

describe("authorizeMedia", () => {
  const session = (sessionId: string, pushes = 0, pullSessionIds: string[] = []) =>
    ({ kind: "session", sessionId, pushes, pullSessionIds }) as const;

  it("enforces session ownership", () => {
    expect(authorizeMedia(owned, member, session("s-abby", 1))).toEqual({ ok: true });
    expect(authorizeMedia(owned, member, session("s-otto")).ok).toBe(false);
    expect(authorizeMedia(owned, member, session("s-unknown")).ok).toBe(false);
  });

  it("lets the scribe pull but never push", () => {
    expect(authorizeMedia(owned, scribe, session("s-scribe", 0, ["s-abby"]))).toEqual({ ok: true });
    expect(authorizeMedia(owned, scribe, session("s-scribe", 1))).toMatchObject({ ok: false, status: 403 });
  });

  it("only pulls sessions registered in this room", () => {
    expect(authorizeMedia(owned, member, session("s-abby", 0, ["s-otto"])).ok).toBe(true);
    expect(authorizeMedia(owned, member, session("s-abby", 0, ["s-other-room"])).ok).toBe(false);
  });

  it("requires an open room socket (a participant view)", () => {
    expect(authorizeMedia(initialState(), member, { kind: "ice" })).toMatchObject({ ok: false, status: 403 });
    const left = leaveParticipant(owned, member.uid, 9).state;
    expect(authorizeMedia(left, member, { kind: "newSession" }).ok).toBe(false);
  });

  it("refuses waiting, removed and ended tickets", () => {
    expect(authorizeMedia(owned, knocker, { kind: "newSession" })).toMatchObject({ ok: false, status: 403 });
    const removed = applyRoomEvent(owned, { t: "removed", uid: member.uid, at: 5_000 }, 5_000);
    expect(authorizeMedia(removed, member, { kind: "ice" })).toMatchObject({ ok: false, status: 401 });
    const rejoined = joinParticipant(removed, { ...member, iat: 6_000 }, 6_000).state;
    expect(authorizeMedia(rejoined, { ...member, iat: 6_000 }, { kind: "ice" })).toEqual({ ok: true });
    const ended = applyRoomEvent(owned, { t: "ended" }, 9);
    expect(authorizeMedia(ended, host, { kind: "newSession" }).ok).toBe(false);
  });

  it("caps live sessions per uid", () => {
    const atCap = withSessions(inRoom, member.uid, MAX_SESSIONS_PER_UID);
    expect(authorizeMedia(atCap, member, { kind: "newSession" })).toMatchObject({ ok: false, status: 429 });
    expect(canRegisterSession(atCap, member)).toBe(false);
    expect(authorizeMedia(atCap, host, { kind: "newSession" })).toEqual({ ok: true });
    const belowCap = withSessions(inRoom, member.uid, MAX_SESSIONS_PER_UID - 1);
    expect(canRegisterSession(belowCap, member)).toBe(true);
  });

  it("caps the whole room's session map", () => {
    const full = withSessions(inRoom, "ghost", MAX_ROOM_SESSIONS);
    expect(authorizeMedia(full, member, { kind: "newSession" })).toMatchObject({ ok: false, status: 429 });
  });
});
