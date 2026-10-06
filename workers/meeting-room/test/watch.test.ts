import { describe, expect, it } from "vitest";
import { MEETING_WATCH_START_LEAD_MS } from "../../../src/lib/meetings/protocol";
import { handleClientMessage, rateKindOf } from "../src/room-messages";
import { endedState, initialState, joinParticipant, normalizeState, type RoomState } from "../src/room-state";
import { parseClientMessage } from "../src/validation";
import { host, knocker, member, sage, scribe } from "./fixtures";

const room = [host, member, sage, scribe].reduce((state, t, i) => joinParticipant(state, t, i).state, initialState("m1"));
const newId = () => "w1";

function started(): RoomState {
  const outcome = handleClientMessage(room, member, { t: "watch", action: "start", mediaId: "media1", versionId: "ver1" }, 100, newId);
  if (outcome.kind !== "watch") throw new Error("expected watch");
  return outcome.state;
}

describe("watch together", () => {
  it("start plays from 0 after the lead, by anyone admitted", () => {
    expect(started().watch).toEqual({
      id: "w1",
      mediaId: "media1",
      versionId: "ver1",
      playing: true,
      position: 0,
      at: 100 + MEETING_WATCH_START_LEAD_MS,
      action: "start",
      by: member.uid,
      byName: "Abby"
    });
  });

  it("pause, seek and play stamp the room clock and keep the id", () => {
    const paused = handleClientMessage(started(), sage, { t: "watch", action: "pause", id: "w1", position: 12.5 }, 5000);
    if (paused.kind !== "watch") throw new Error("expected watch");
    expect(paused.state.watch).toMatchObject({ id: "w1", playing: false, position: 12.5, at: 5000, action: "pause", byName: "Sage" });

    const seeked = handleClientMessage(paused.state, host, { t: "watch", action: "seek", id: "w1", position: 30 }, 6000);
    if (seeked.kind !== "watch") throw new Error("expected watch");
    expect(seeked.state.watch).toMatchObject({ playing: false, position: 30, at: 6000, action: "seek", byName: "Otto" });

    const played = handleClientMessage(seeked.state, member, { t: "watch", action: "play", id: "w1", position: 30 }, 7000);
    if (played.kind !== "watch") throw new Error("expected watch");
    expect(played.state.watch).toMatchObject({ playing: true, position: 30, at: 7000, action: "play" });
  });

  it("refuses controls for an older watch, and with nothing playing", () => {
    expect(handleClientMessage(started(), member, { t: "watch", action: "pause", id: "old", position: 1 }, 5, newId)).toEqual({
      kind: "error",
      message: "That video changed. Try again."
    });
    expect(handleClientMessage(room, member, { t: "watch", action: "stop", id: "w1" }, 5, newId).kind).toBe("error");
  });

  it("stop clears it; a new start replaces it with a new id", () => {
    const stopped = handleClientMessage(started(), sage, { t: "watch", action: "stop", id: "w1" }, 5);
    expect(stopped.kind === "watch" && stopped.state.watch).toBeNull();
    const replaced = handleClientMessage(started(), sage, { t: "watch", action: "start", mediaId: "m2", versionId: "v2" }, 9, () => "w2");
    expect(replaced.kind === "watch" && replaced.state.watch?.id).toBe("w2");
  });

  it("the Scribe and people in the lobby can't control it", () => {
    const start = { t: "watch", action: "start", mediaId: "a", versionId: "b" } as const;
    expect(handleClientMessage(room, scribe, start, 5).kind).toBe("error");
    expect(handleClientMessage(room, knocker, start, 5).kind).toBe("error");
  });

  it("counts against the watch rate limit", () => {
    expect(rateKindOf({ t: "watch", action: "stop", id: "w1" })).toBe("watch");
  });

  it("is cleared when the meeting ends, and defaults to null for an older stored room", () => {
    expect(endedState(started(), 10).watch).toBeNull();
    const { watch: _watch, ...older } = initialState("m1");
    expect(normalizeState(older).watch).toBeNull();
  });
});

describe("watch validation", () => {
  const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

  it("accepts each action", () => {
    expect(parse({ t: "watch", action: "start", mediaId: "a", versionId: "b" }).ok).toBe(true);
    expect(parse({ t: "watch", action: "seek", id: "w1", position: 61.25 }).ok).toBe(true);
    expect(parse({ t: "watch", action: "stop", id: "w1" }).ok).toBe(true);
  });

  it("rejects bad positions, missing ids and unknown actions", () => {
    for (const bad of [
      { t: "watch", action: "seek", id: "w1", position: -1 },
      { t: "watch", action: "seek", id: "w1", position: 99_999 },
      { t: "watch", action: "play", id: "w1" },
      { t: "watch", action: "pause", position: 1 },
      { t: "watch", action: "start", mediaId: "a" },
      { t: "watch", action: "rewind", id: "w1" }
    ]) {
      expect(parse(bad).ok).toBe(false);
    }
  });

  it("drops extra fields", () => {
    const parsed = parse({ t: "watch", action: "stop", id: "w1", extra: "x" });
    expect(parsed.ok && parsed.value).toEqual({ t: "watch", action: "stop", id: "w1" });
  });
});
