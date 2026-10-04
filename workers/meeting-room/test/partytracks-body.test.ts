import { describe, expect, it } from "vitest";
import { MAX_SDP_CHARS, sanitizeSessionBody } from "../src/partytracks-body";

const offer = { type: "offer", sdp: "v=0..." };

describe("sanitizeSessionBody", () => {
  it("rebuilds a push body from allowed fields only", () => {
    const raw = {
      sessionDescription: { ...offer, extra: 1 },
      tracks: [{ location: "local", trackName: "cam", mid: "0", evil: "x" }],
      autoDiscover: true
    };
    expect(sanitizeSessionBody("tracks/new", raw)).toEqual({
      body: { sessionDescription: offer, tracks: [{ location: "local", trackName: "cam", mid: "0" }] },
      pushes: 1,
      pullSessionIds: []
    });
  });

  it("rebuilds a pull body and lists pulled sessions", () => {
    const raw = { tracks: [{ location: "remote", sessionId: "s1", trackName: "cam", simulcast: { preferredRid: "h", x: 1 } }] };
    expect(sanitizeSessionBody("tracks/new", raw)).toEqual({
      body: { tracks: [{ location: "remote", sessionId: "s1", trackName: "cam", simulcast: { preferredRid: "h" } }] },
      pushes: 0,
      pullSessionIds: ["s1"]
    });
  });

  it("rejects malformed track bodies", () => {
    expect(sanitizeSessionBody("tracks/new", { tracks: [{ location: "local", trackName: "cam" }] })).toBeNull(); // push without SDP
    expect(sanitizeSessionBody("tracks/new", { tracks: [{ location: "remote", trackName: "cam" }] })).toBeNull();
    expect(sanitizeSessionBody("tracks/new", { tracks: [{ location: "elsewhere" }] })).toBeNull();
    expect(sanitizeSessionBody("tracks/new", { tracks: [] })).toBeNull();
    expect(sanitizeSessionBody("tracks/new", "nope")).toBeNull();
    const huge = { sessionDescription: { type: "offer", sdp: "x".repeat(MAX_SDP_CHARS + 1) }, tracks: [{ location: "local", trackName: "a" }] };
    expect(sanitizeSessionBody("tracks/new", huge)).toBeNull();
  });

  it("handles update, close and renegotiate shapes", () => {
    const update = { tracks: [{ location: "remote", sessionId: "s1", trackName: "cam", mid: "3", simulcast: { preferredRid: "l" } }] };
    expect(sanitizeSessionBody("tracks/update", update)?.pullSessionIds).toEqual(["s1"]);
    expect(sanitizeSessionBody("tracks/update", { tracks: [{ trackName: "cam" }] })).toBeNull();

    const close = { tracks: [{ mid: "1", junk: true }], sessionDescription: offer, force: false, extra: 1 };
    expect(sanitizeSessionBody("tracks/close", close)?.body).toEqual({ tracks: [{ mid: "1" }], sessionDescription: offer, force: false });

    const answer = { sessionDescription: { type: "answer", sdp: "v=0" }, other: 1 };
    expect(sanitizeSessionBody("renegotiate", answer)?.body).toEqual({ sessionDescription: { type: "answer", sdp: "v=0" } });
    expect(sanitizeSessionBody("renegotiate", { sessionDescription: { type: "pranswer", sdp: "v" } })).toBeNull();
  });
});
