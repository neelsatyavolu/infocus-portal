import { describe, expect, it } from "vitest";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import {
  INITIAL_ROOM_STATE,
  participantList,
  raisedHands,
  resetForReconnect,
  roomReducer,
  scribePresent
} from "@/src/lib/meetings/client/room-state";

const person = (uid: string, extra: Partial<MeetingParticipantView> = {}): MeetingParticipantView => ({
  uid,
  name: uid,
  isHost: false,
  isScribe: false,
  audioOn: true,
  videoOn: true,
  screenOn: false,
  handRaisedAt: null,
  tracks: {},
  joinedAt: 1,
  ...extra
});

const welcome = roomReducer(INITIAL_ROOM_STATE, {
  t: "welcome",
  self: { uid: "me", admitted: true, isHost: true },
  participants: [person("me"), person("abby", { joinedAt: 0 })],
  waiting: [{ uid: "otto", name: "Otto", since: 5 }],
  settings: { quickAccess: false, notesEnabled: true },
  epoch: 2
});

describe("roomReducer", () => {
  it("applies welcome", () => {
    expect(welcome.phase).toBe("admitted");
    expect(welcome.isHost).toBe(true);
    expect(participantList(welcome).map((p) => p.uid)).toEqual(["abby", "me"]);
    expect(welcome.waiting).toHaveLength(1);
    expect(welcome.epoch).toBe(2);
  });

  it("puts a waiting ticket in the lobby", () => {
    const state = roomReducer(INITIAL_ROOM_STATE, {
      t: "welcome",
      self: { uid: "sage", admitted: false, isHost: false },
      participants: [],
      waiting: [],
      settings: { quickAccess: false, notesEnabled: true },
      epoch: 0
    });
    expect(state.phase).toBe("waiting");
    expect(roomReducer(state, { t: "denied" }).phase).toBe("denied");
  });

  it("upserts and removes participants without mutating", () => {
    const joined = roomReducer(welcome, { t: "participant", participant: person("sage", { handRaisedAt: 10 }) });
    expect(Object.keys(welcome.participants)).not.toContain("sage");
    expect(raisedHands(joined).map((p) => p.uid)).toEqual(["sage"]);
    const left = roomReducer(joined, { t: "left", uid: "sage" });
    expect(Object.keys(left.participants)).toEqual(["me", "abby"]);
    expect(roomReducer(left, { t: "left", uid: "nobody" })).toBe(left);
  });

  it("tracks settings, rekeys and the scribe", () => {
    const withScribe = roomReducer(welcome, { t: "participant", participant: person("scribe", { isScribe: true }) });
    expect(scribePresent(withScribe)).toBe(true);
    expect(roomReducer(welcome, { t: "rekey", epoch: 3 }).epoch).toBe(3);
    expect(roomReducer(welcome, { t: "rekey", epoch: 1 }).epoch).toBe(2);
    expect(roomReducer(welcome, { t: "settings", settings: { quickAccess: true, notesEnabled: false } }).settings).toEqual({
      quickAccess: true,
      notesEnabled: false
    });
  });

  it("bumps the agenda version on agenda events", () => {
    const once = roomReducer(welcome, { t: "agenda", version: 5 });
    expect(once.agendaVersion).toBe(5);
    expect(roomReducer(once, { t: "agenda", version: 3 }).agendaVersion).toBe(6);
  });

  it("applies host hand-off", () => {
    const guest = roomReducer(welcome, { t: "role", isHost: false });
    expect(guest.isHost).toBe(false);
    expect(roomReducer(guest, { t: "role", isHost: true }).isHost).toBe(true);
    expect(roomReducer(welcome, { t: "role", isHost: true })).toBe(welcome);
  });

  it("stays ended or removed", () => {
    const ended = roomReducer(welcome, { t: "ended" });
    expect(ended.phase).toBe("ended");
    expect(roomReducer(ended, { t: "participant", participant: person("x") })).toBe(ended);
    expect(resetForReconnect(ended)).toBe(ended);
    expect(roomReducer(welcome, { t: "removed" }).phase).toBe("removed");
    expect(resetForReconnect(welcome).phase).toBe("connecting");
  });

  it("ignores side-effect-only messages", () => {
    expect(roomReducer(welcome, { t: "pong" })).toBe(welcome);
    expect(roomReducer(welcome, { t: "muted", kind: "audio", by: "Abby" })).toBe(welcome);
  });
});
