import { describe, expect, it } from "vitest";
import { MEETING_DIAG_MAX_BYTES } from "../../../src/lib/meetings/protocol";
import { DIAG_RATE_RULES, diagLogLine, diagRateKey } from "../src/diagnostics";
import { logLine, shortId } from "../src/log";
import { proxyErrorSummary } from "../src/partytracks-proxy";
import { takeToken, type RateBuckets } from "../src/rate-limit";
import { handleClientMessage } from "../src/room-messages";
import { initialState } from "../src/room-state";
import { parseClientMessage } from "../src/validation";
import { member, ticket } from "./fixtures";

const diag = (data: unknown, kind = "periodic") => JSON.stringify({ t: "diag", kind, data });

describe("diag messages", () => {
  it("accepts flat primitives", () => {
    const parsed = parseClientMessage(diag({ pc: "connected", "in.audio.lost": 3, blocked: false, epoch: null }));
    expect(parsed).toEqual({
      ok: true,
      value: { t: "diag", kind: "periodic", data: { pc: "connected", "in.audio.lost": 3, blocked: false, epoch: null } }
    });
  });

  it("rejects nested values, arrays, odd keys, reserved keys, unknown kinds and long strings", () => {
    for (const bad of [
      diag({ nested: { a: 1 } }),
      diag({ list: [1, 2] }),
      diag({ "bad key": 1 }),
      diag({ uid: "spoof" }),
      diag({ evt: "spoof" }),
      diag({ s: "x".repeat(301) }),
      diag({ a: 1 }, "other"),
      diag([1, 2]),
      JSON.stringify({ t: "diag", kind: "event" })
    ]) {
      expect(parseClientMessage(bad).ok).toBe(false);
    }
  });

  it("caps the whole message at 2 KB", () => {
    const big = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, "v".repeat(70)]));
    expect(diag(big).length).toBeGreaterThan(MEETING_DIAG_MAX_BYTES);
    expect(parseClientMessage(diag(big))).toEqual({ ok: false, error: "Diagnostics are too large." });
  });

  it("is handled for any socket (lobby too) and never broadcast", () => {
    const parsed = parseClientMessage(diag({ a: 1 }, "event"));
    if (!parsed.ok) throw new Error("expected ok");
    expect(handleClientMessage(initialState("m1"), ticket({ adm: false }), parsed.value, 1)).toEqual({ kind: "diag", message: parsed.value });
  });

  it("rate limits per socket: 1 periodic and 3 events per 5 s", () => {
    let buckets: RateBuckets = {};
    const tries = (kind: "periodic" | "event", count: number, at: number) =>
      Array.from({ length: count }, () => {
        const taken = takeToken(buckets, diagRateKey("sock-1", kind), DIAG_RATE_RULES[kind], at);
        buckets = taken.buckets;
        return taken.allowed;
      });
    expect(tries("periodic", 2, 0)).toEqual([true, false]);
    expect(tries("event", 4, 0)).toEqual([true, true, true, false]);
    expect(tries("periodic", 1, 5_000)).toEqual([true]);
    // Another socket has its own budget.
    expect(takeToken(buckets, diagRateKey("sock-2", "periodic"), DIAG_RATE_RULES.periodic, 0).allowed).toBe(true);
  });

  it("logs as one JSON line where evt, mid, uid and kind can't be overwritten", () => {
    const line = JSON.parse(diagLogLine("m1", member.uid, { t: "diag", kind: "event", data: { what: "pc_failed", pc: "failed" } }));
    expect(line).toEqual({ evt: "client", mid: "m1", uid: member.uid, kind: "event", what: "pc_failed", pc: "failed" });
  });
});

describe("log lines", () => {
  it("drop undefined details and shorten session ids", () => {
    expect(JSON.parse(logLine("proxy", "m1", "u", { status: 200, error: undefined, evt: "spoof" }))).toEqual({
      evt: "proxy",
      mid: "m1",
      uid: "u",
      status: 200
    });
    expect(shortId("0123456789abcdef")).toBe("01234567");
    expect(shortId(null)).toBeNull();
  });

  it("summarise proxy errors by code and description only", async () => {
    const cloudflare = new Response(JSON.stringify({ errorCode: "session_error", errorDescription: "Session not found", sessionDescription: { sdp: "v=0…" } }), { status: 404 });
    expect(await proxyErrorSummary(cloudflare)).toBe("session_error: Session not found");
    expect(await proxyErrorSummary(new Response(JSON.stringify({ error: { message: "Too many media sessions." } }), { status: 429 }))).toBe(
      "Too many media sessions."
    );
    expect(await proxyErrorSummary(new Response("not json", { status: 502 }))).toBeNull();
  });
});
