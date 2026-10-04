import { describe, expect, it } from "vitest";
import { handleClientMessage, rateKindOf } from "../src/room-messages";
import { initialState, joinParticipant, joinWaiting, registerSession } from "../src/room-state";
import { host, knocker, member, sage, scribe } from "./fixtures";

const room = [host, member, sage, scribe].reduce((state, t, i) => joinParticipant(state, t, i).state, initialState("m1"));

describe("host-only commands", () => {
  it("rejects mute, muteAll, lowerHand and lowerAllHands from members", () => {
    for (const message of [
      { t: "mute", uid: sage.uid, kind: "audio" },
      { t: "muteAll" },
      { t: "lowerHand", uid: sage.uid },
      { t: "lowerAllHands" }
    ] as const) {
      expect(handleClientMessage(room, member, message, 5)).toEqual({ kind: "error", message: "Only a host can do that." });
    }
  });

  it("lets a host mute one person", () => {
    expect(handleClientMessage(room, host, { t: "mute", uid: sage.uid, kind: "video" }, 5)).toEqual({
      kind: "muted",
      targets: [sage.uid],
      muteKind: "video",
      by: "Otto"
    });
  });

  it("muteAll targets everyone but the host and the scribe", () => {
    const outcome = handleClientMessage(room, host, { t: "muteAll" }, 5);
    expect(outcome.kind === "muted" && [...outcome.targets].sort()).toEqual([member.uid, sage.uid].sort());
  });

  it("lowerAllHands lowers only raised hands", () => {
    const raised = handleClientMessage(room, member, { t: "hand", raised: true }, 7);
    if (raised.kind !== "update") throw new Error("expected update");
    expect(raised.state.participants[member.uid]?.handRaisedAt).toBe(7);
    const lowered = handleClientMessage(raised.state, host, { t: "lowerAllHands" }, 8);
    if (lowered.kind !== "update") throw new Error("expected update");
    expect(lowered.changed).toEqual([member.uid]);
    expect(lowered.state.participants[member.uid]?.handRaisedAt).toBeNull();
  });
});

describe("participant messages", () => {
  it("keeps the original hand time when raised twice", () => {
    const once = handleClientMessage(room, member, { t: "hand", raised: true }, 7);
    if (once.kind !== "update") throw new Error("expected update");
    const twice = handleClientMessage(once.state, member, { t: "hand", raised: true }, 9);
    expect(twice.kind === "update" && twice.state.participants[member.uid]?.handRaisedAt).toBe(7);
  });

  it("stamps chat with the ticket's uid and name and passes ciphertext through", () => {
    const outcome = handleClientMessage(room, member, { t: "chat", id: "c1", ct: "CT", iv: "IV", epoch: 2 }, 42);
    expect(outcome).toEqual({
      kind: "broadcast",
      message: { t: "chat", id: "c1", uid: member.uid, name: "Abby", at: 42, ct: "CT", iv: "IV", epoch: 2 }
    });
  });

  it("only accepts tracks on sessions the sender owns", () => {
    const owned = registerSession(room, "s-abby", member.uid);
    const ok = handleClientMessage(owned, member, { t: "tracks", tracks: { audio: { sessionId: "s-abby", trackName: "a" } } }, 1);
    expect(ok.kind).toBe("update");
    const spoof = handleClientMessage(owned, sage, { t: "tracks", tracks: { audio: { sessionId: "s-abby", trackName: "a" } } }, 1);
    expect(spoof).toEqual({ kind: "error", message: "Unknown media session." });
  });

  it("refuses everything but ping from waiting tickets and the scribe", () => {
    const waiting = joinWaiting(room, knocker, 1).state;
    expect(handleClientMessage(waiting, knocker, { t: "reaction", emoji: "👍" }, 1).kind).toBe("error");
    expect(handleClientMessage(waiting, knocker, { t: "ping" }, 1).kind).toBe("pong");
    expect(handleClientMessage(room, scribe, { t: "hand", raised: true }, 1).kind).toBe("error");
  });

  it("classifies rate-limited messages", () => {
    expect(rateKindOf({ t: "reaction", emoji: "🎉" })).toBe("reaction");
    expect(rateKindOf({ t: "chat", id: "x", ct: "c", iv: "i", epoch: 0 })).toBe("chat");
    expect(rateKindOf({ t: "ping" })).toBeNull();
  });
});
