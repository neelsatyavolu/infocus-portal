import { describe, expect, it } from "vitest";
import { MAX_CHAT_CT_CHARS, MAX_MESSAGE_BYTES, parseClientMessage, parseRoomEvent } from "../src/validation";

describe("parseClientMessage", () => {
  it("accepts every allowed reaction and rejects others", () => {
    expect(parseClientMessage(JSON.stringify({ t: "reaction", emoji: "👏" })).ok).toBe(true);
    expect(parseClientMessage(JSON.stringify({ t: "reaction", emoji: "💩" })).ok).toBe(false);
    expect(parseClientMessage(JSON.stringify({ t: "reaction", emoji: "<b>" })).ok).toBe(false);
  });

  it("rejects messages over 64 KB, binary frames and bad JSON", () => {
    const big = JSON.stringify({ t: "ping", pad: "x".repeat(MAX_MESSAGE_BYTES) });
    expect(parseClientMessage(big)).toEqual({ ok: false, error: "Message is too large." });
    expect(parseClientMessage(new ArrayBuffer(4)).ok).toBe(false);
    expect(parseClientMessage("{").ok).toBe(false);
  });

  it("caps chat ciphertext at 8 KB and drops unknown fields", () => {
    const chat = { t: "chat", id: "c1", iv: "iv", epoch: 0, uid: "spoof", name: "Spoof" };
    const ok = parseClientMessage(JSON.stringify({ ...chat, ct: "a".repeat(MAX_CHAT_CT_CHARS) }));
    expect(ok.ok && ok.value).toEqual({ t: "chat", id: "c1", ct: "a".repeat(MAX_CHAT_CT_CHARS), iv: "iv", epoch: 0 });
    expect(parseClientMessage(JSON.stringify({ ...chat, ct: "a".repeat(MAX_CHAT_CT_CHARS + 1) })).ok).toBe(false);
  });

  it("validates tracks", () => {
    const good = { t: "tracks", tracks: { video: { location: "remote", sessionId: "s1", trackName: "v", mid: "1" } } };
    expect(parseClientMessage(JSON.stringify(good)).ok).toBe(true);
    expect(parseClientMessage(JSON.stringify({ t: "tracks", tracks: { hologram: {} } })).ok).toBe(false);
    expect(parseClientMessage(JSON.stringify({ t: "tracks", tracks: { audio: { location: "moon" } } })).ok).toBe(false);
  });

  it("rejects unknown types and malformed host commands", () => {
    expect(parseClientMessage(JSON.stringify({ t: "kick", uid: "x" })).ok).toBe(false);
    expect(parseClientMessage(JSON.stringify({ t: "mute", uid: "x", kind: "screen" })).ok).toBe(false);
  });
});

describe("parseRoomEvent", () => {
  it("parses each event and rejects bad shapes", () => {
    expect(parseRoomEvent({ t: "removed", uid: "u", at: 5 })).toEqual({ ok: true, value: { t: "removed", uid: "u", at: 5 } });
    expect(parseRoomEvent({ t: "removed", uid: "u" }).ok).toBe(false);
    expect(parseRoomEvent({ t: "settings", settings: { quickAccess: true, notesEnabled: false } }).ok).toBe(true);
    expect(parseRoomEvent({ t: "settings", settings: { quickAccess: "yes" } }).ok).toBe(false);
    expect(parseRoomEvent({ t: "ended" }).ok).toBe(true);
    expect(parseRoomEvent("ended").ok).toBe(false);
  });
});
