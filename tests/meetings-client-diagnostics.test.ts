import { afterEach, describe, expect, it } from "vitest";
import { MEETING_DIAG_MAX_BYTES } from "@/src/lib/meetings/protocol";
import {
  CallDiagnostics,
  DIAG_BUFFER_SIZE,
  capDiagData,
  debugInfo,
  diagEvent,
  diagMessageBytes,
  micSettingsDiag,
  shortHash,
  registerPulledTrack,
  setDiagSink,
  summarizeStats,
  unregisterPulledTrack,
  type StatLike
} from "@/src/lib/meetings/client/diagnostics";

const owners: Record<string, { uid: string; kind: string }> = {
  "track-abby-audio": { uid: "u-abby-0000000000", kind: "audio" },
  "track-abby-video": { uid: "u-abby-0000000000", kind: "video" },
  "track-otto-audio": { uid: "u-otto-1111111111", kind: "audio" }
};
const owner = (id: string) => owners[id] ?? null;

function report(sample: number): StatLike[] {
  return [
    { type: "transport", id: "T1", selectedCandidatePairId: "CP1" },
    { type: "candidate-pair", id: "CP1", localCandidateId: "L1", remoteCandidateId: "R1", currentRoundTripTime: 0.042, nominated: true, state: "succeeded" },
    { type: "local-candidate", id: "L1", candidateType: "relay", relayProtocol: "tls", protocol: "udp", address: "203.0.113.5" },
    { type: "remote-candidate", id: "R1", candidateType: "host", address: "198.51.100.7" },
    { type: "outbound-rtp", id: "OA", kind: "audio", bytesSent: 1000 * sample, packetsSent: 50 * sample },
    { type: "outbound-rtp", id: "OV0", kind: "video", bytesSent: 5000 * sample, packetsSent: 40 * sample, framesEncoded: 300 * sample, qualityLimitationReason: "none" },
    { type: "outbound-rtp", id: "OV1", kind: "video", bytesSent: 2000 * sample, packetsSent: 20 * sample, framesEncoded: 300 * sample, qualityLimitationReason: "bandwidth" },
    { type: "inbound-rtp", id: "IA1", kind: "audio", trackIdentifier: "track-abby-audio", packetsReceived: 500 * sample, packetsLost: 2 * sample, bytesReceived: 9000 * sample, jitter: 0.012, audioLevel: 0.21 },
    { type: "inbound-rtp", id: "IV1", kind: "video", trackIdentifier: "track-abby-video", packetsReceived: 800 * sample, packetsLost: 0, bytesReceived: 70000 * sample, jitter: 0.02, framesDecoded: 300 * sample, freezeCount: 1 },
    // Otto's audio isn't arriving (the "couldn't hear each other" case).
    { type: "inbound-rtp", id: "IA2", kind: "audio", trackIdentifier: "track-otto-audio", packetsReceived: 0, packetsLost: 0, bytesReceived: 0, jitter: 0, totalAudioEnergy: 0 }
  ];
}

afterEach(() => setDiagSink(null));

describe("summarizeStats", () => {
  it("reports the selected pair, outbound totals and inbound deltas per remote and kind", () => {
    const first = summarizeStats(report(1), {}, owner);
    const second = summarizeStats(report(2), first.counters, owner);
    expect(second.data).toMatchObject({
      "pair.local": "relay",
      "pair.remote": "host",
      "pair.relay": "tls",
      "pair.proto": "udp",
      "pair.rttMs": 42,
      "out.audio.bytes": 2000,
      "out.audio.pkts": 100,
      "out.video.bytes": 14000,
      "out.video.frames": 1200,
      "out.video.qlr": "bandwidth",
      // Deltas since the first sample:
      "in.u-abby-0.audio.pkts": 500,
      "in.u-abby-0.audio.lost": 2,
      "in.u-abby-0.audio.bytes": 9000,
      "in.u-abby-0.audio.jitterMs": 12,
      "in.u-abby-0.audio.level": 0.21,
      "in.u-abby-0.video.frames": 300,
      "in.u-abby-0.video.freezes": 1,
      "in.u-otto-1.audio.pkts": 0,
      "in.u-otto-1.audio.level": 0,
      "in.streams": 3
    });
  });

  it("never carries addresses, full ids or other raw stat fields", () => {
    const text = JSON.stringify(summarizeStats(report(1), {}, owner).data);
    expect(text).not.toContain("203.0.113.5");
    expect(text).not.toContain("u-abby-0000000000");
    expect(text).not.toContain("track-");
  });

  it("puts streams it can't attribute under 'unknown'", () => {
    const { data } = summarizeStats(report(1), {}, () => null);
    expect(data["in.unknown.audio.pkts"]).toBe(500);
  });
});

describe("audio diagnostics", () => {
  const audioReport = (sample: number): StatLike[] => [
    { type: "media-source", id: "S1", kind: "audio", audioLevel: 0.123456, totalAudioEnergy: 0.5 * sample },
    {
      type: "inbound-rtp",
      id: "IA1",
      kind: "audio",
      trackIdentifier: "track-abby-audio",
      packetsReceived: 500 * sample,
      packetsLost: 0,
      bytesReceived: 9000 * sample,
      totalSamplesReceived: 480_000 * sample,
      concealedSamples: 24_000 * sample,
      jitterBufferDelay: 40_000 * sample,
      jitterBufferEmittedCount: 480_000 * sample
    }
  ];

  it("reports the mic's outbound level/energy and inbound concealment and jitter buffer as deltas", () => {
    const first = summarizeStats(audioReport(1), {}, owner);
    expect(first.data["out.audio.level"]).toBe(0.123);
    expect(first.data["out.audio.energy"]).toBe(0.5);
    expect(first.data["in.u-abby-0.audio.concealPct"]).toBe(5);
    expect(first.data["in.u-abby-0.audio.jbMs"]).toBe(83);
    const second = summarizeStats(audioReport(3), first.counters, owner);
    expect(second.data["out.audio.energy"]).toBe(1);
    expect(second.data["in.u-abby-0.audio.concealPct"]).toBe(5);
  });

  it("summarises the mic's real capture settings, hashing the device id", () => {
    const data = micSettingsDiag({
      sampleRate: 44_100,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      deviceId: "a3f0c1d2e4b5968778695a4b3c2d1e0f"
    });
    expect(data).toMatchObject({ "mic.rate": 44_100, "mic.ch": 1, "mic.ec": true, "mic.ns": true, "mic.agc": true });
    expect(String(data["mic.dev"])).toMatch(/^[0-9a-z]{1,6}$/);
    expect(JSON.stringify(data)).not.toContain("a3f0c1d2");
    expect(shortHash("same")).toBe(shortHash("same"));
    expect(micSettingsDiag(null)).toEqual({ "mic.rate": null });
  });
});

describe("capDiagData", () => {
  it("leaves a small message alone", () => {
    const { data } = summarizeStats(report(1), {}, owner);
    expect(capDiagData("periodic", data)).toBe(data);
  });

  it("summarises big calls to totals per kind plus the worst remote, under 2 KB", () => {
    const many: StatLike[] = [];
    for (let i = 0; i < 40; i += 1) {
      many.push({ type: "inbound-rtp", id: `A${i}`, kind: "audio", trackIdentifier: `t${i}`, packetsReceived: i === 7 ? 0 : 400, packetsLost: 1, bytesReceived: 8000, jitter: 0.01 });
    }
    const big = summarizeStats(many, {}, (id) => ({ uid: `uid-${id.padStart(4, "0")}`, kind: "audio" })).data;
    expect(diagMessageBytes("periodic", big)).toBeGreaterThan(MEETING_DIAG_MAX_BYTES);
    const capped = capDiagData("periodic", big);
    expect(diagMessageBytes("periodic", capped)).toBeLessThanOrEqual(MEETING_DIAG_MAX_BYTES);
    expect(capped).toMatchObject({ summarized: true, "in.audio.pkts": 39 * 400, "in.audio.lost": 40, "in.worst.pkts": 0, "in.worst.kind": "audio" });
  });

  it("drops keys as a last resort and says so", () => {
    const huge = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`key${i}`, "x".repeat(20)]));
    const capped = capDiagData("event", huge);
    expect(diagMessageBytes("event", capped)).toBeLessThanOrEqual(MEETING_DIAG_MAX_BYTES);
    expect(capped.truncated).toBe(true);
  });
});

describe("CallDiagnostics", () => {
  it("sends diag messages, keeps the last 200, and clips long strings", () => {
    const sent: unknown[] = [];
    const diagnostics = new CallDiagnostics((message) => sent.push(message) > 0);
    setDiagSink(diagnostics);
    diagEvent("pull_failed", { message: "y".repeat(500), status: 429 });
    expect(sent[0]).toMatchObject({ t: "diag", kind: "event", data: { what: "pull_failed", status: 429 } });
    expect(((sent[0] as { data: { message: string } }).data.message).length).toBe(200);
    for (let i = 0; i < DIAG_BUFFER_SIZE + 10; i += 1) diagEvent("tick", { i });
    expect(diagnostics.recent()).toHaveLength(DIAG_BUFFER_SIZE);
    expect(diagnostics.recent().at(-1)?.data.i).toBe(DIAG_BUFFER_SIZE + 9);
  });

  it("is a no-op outside a call", () => {
    expect(() => diagEvent("nothing")).not.toThrow();
  });

  it("builds the Copy debug info blob without names", () => {
    setDiagSink(new CallDiagnostics(() => true));
    diagEvent("leave_click");
    const blob = JSON.parse(debugInfo({ meetingId: "m1", uid: "u-abby", userAgent: "UA", build: "abc1234" }));
    expect(blob).toMatchObject({ meetingId: "m1", uid: "u-abby", userAgent: "UA", build: "abc1234" });
    expect(blob.diags[0].data).toEqual({ what: "leave_click" });
    expect(Object.keys(blob).sort()).toEqual(["at", "build", "diags", "meetingId", "uid", "userAgent"]);
  });

  it("keeps a registry of pulled tracks for attribution", () => {
    registerPulledTrack("track-x", "sess1234abcd", "audio-1");
    unregisterPulledTrack("track-x");
  });
});
