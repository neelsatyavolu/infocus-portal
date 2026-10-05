/**
 * Turns what the participants recorded into per-track and aggregate metrics.
 * Only frames whose embedded send time falls inside the measurement window count, so warm-up
 * and drain are excluded. All participants share one clock (one machine), so latency is
 * arrival - embedded send time.
 */
import { percentile, type Kind } from "./common";
import type { Participant } from "./participant";

export type MeasureWindow = { start: number; end: number };

export type TrackMetrics = {
  receiver: string;
  publisher: string;
  kind: Kind;
  expected: number;
  received: number;
  /** Received / expected, in %. */
  completePct: number;
  latency: { p50: number; p95: number; p99: number };
  /** RFC 3550 interarrival jitter (ms), audio only, using the embedded send time as the send clock. */
  jitterMs: number;
  /** Video only: arrival gaps between consecutive complete frames. */
  interval: { p50: number; p95: number };
  freezes200: number;
  longestGapMs: number;
  kbps: number;
  decryptFailures: number;
  integrityFailures: number;
};

export type JoinMetrics = {
  uid: string;
  welcomeMs: number;
  /** Push answer applied -> peer connection connected (ICE + DTLS). */
  iceMs: number;
  /** Push request -> connected (includes the SFU round trip). */
  pushToConnectedMs: number;
};

export type FirstFrame = { receiver: string; publisher: string; kind: Kind; fromPublishMs: number; fromPullMs: number };

const FREEZE_MS = 200;

function rfc3550Jitter(records: readonly { sentAt: number; arrival: number }[]) {
  const ordered = [...records].sort((a, b) => a.arrival - b.arrival);
  let jitter = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const d = ordered[i]!.arrival - ordered[i - 1]!.arrival - (ordered[i]!.sentAt - ordered[i - 1]!.sentAt);
    jitter += (Math.abs(d) - jitter) / 16;
  }
  return jitter;
}

function gaps(arrivals: readonly number[]) {
  const sorted = [...arrivals].sort((a, b) => a - b);
  return sorted.slice(1).map((value, i) => value - sorted[i]!);
}

export function trackMetrics(participants: readonly Participant[], window: MeasureWindow): TrackMetrics[] {
  const seconds = (window.end - window.start) / 1000;
  const inWindow = (sentAt: number) => sentAt >= window.start && sentAt < window.end;
  const byUid = new Map(participants.map((p) => [p.uid, p]));
  const rows: TrackMetrics[] = [];
  for (const receiver of participants) {
    for (const inbound of receiver.inbound.values()) {
      const publisher = byUid.get(inbound.publisher);
      if (!publisher) continue;
      for (const kind of ["audio", "video"] as const) {
        const expected = new Set(publisher.sent[kind].filter((f) => inWindow(f.sentAt)).map((f) => f.counter));
        const unique = new Map<number, { sentAt: number; arrival: number; bytes: number }>();
        const records = kind === "audio" ? inbound.audio.map((r) => ({ ...r, bytes: 0 })) : inbound.video;
        for (const record of records) if (expected.has(record.counter) && !unique.has(record.counter)) unique.set(record.counter, record);
        const got = [...unique.values()];
        const latencies = got.map((r) => r.arrival - r.sentAt);
        const intervals = gaps(got.map((r) => r.arrival));
        rows.push({
          receiver: receiver.uid,
          publisher: publisher.uid,
          kind,
          expected: expected.size,
          received: got.length,
          completePct: expected.size ? (got.length / expected.size) * 100 : 0,
          latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99) },
          jitterMs: kind === "audio" ? rfc3550Jitter(got) : NaN,
          interval: { p50: percentile(intervals, 50), p95: percentile(intervals, 95) },
          freezes200: kind === "video" ? intervals.filter((gap) => gap > FREEZE_MS).length : 0,
          longestGapMs: intervals.length ? Math.max(...intervals) : NaN,
          kbps: (got.reduce((sum, r) => sum + r.bytes, 0) * 8) / seconds / 1000,
          decryptFailures: inbound.decryptFailures,
          integrityFailures: inbound.integrityFailures.length
        });
      }
    }
  }
  return rows;
}

export function joinMetrics(participants: readonly Participant[]): JoinMetrics[] {
  return participants.map((p) => ({
    uid: p.uid,
    welcomeMs: p.times.welcomeAt - p.times.ticketAt,
    iceMs: p.times.connectedAt - p.times.answerAt,
    pushToConnectedMs: p.times.connectedAt - p.times.pushRequestAt
  }));
}

export function firstFrames(participants: readonly Participant[]): FirstFrame[] {
  const byUid = new Map(participants.map((p) => [p.uid, p]));
  return participants.flatMap((receiver) =>
    [...receiver.inbound.values()].flatMap((inbound) =>
      (["audio", "video"] as const).flatMap((kind) => {
        const records = kind === "audio" ? inbound.audio : inbound.video;
        const publisher = byUid.get(inbound.publisher);
        if (!records.length || !publisher) return [];
        const first = Math.min(...records.map((r) => r.arrival));
        return [{
          receiver: receiver.uid,
          publisher: inbound.publisher,
          kind,
          fromPublishMs: first - publisher.times.pushRequestAt,
          fromPullMs: first - inbound.pullRequestAt
        }];
      })
    )
  );
}

/** Sender pacing drift (ms) across every frame sent inside the window. */
export function senderDrift(participants: readonly Participant[], window: MeasureWindow) {
  const drifts = participants.flatMap((p) =>
    (["audio", "video"] as const).flatMap((kind) => p.sent[kind].filter((f) => f.sentAt >= window.start && f.sentAt < window.end).map((f) => f.drift))
  );
  return { p50: percentile(drifts, 50), p95: percentile(drifts, 95), max: drifts.length ? Math.max(...drifts) : NaN };
}

/** Proxy calls per uid (total and the busiest 10 s window, vs the Worker's 60 / 10 s), non-2xx replies and pull batching. */
export function signalingStats(participants: readonly Participant[]) {
  const busiest = (times: number[]) =>
    times.reduce((best, at, i) => Math.max(best, times.slice(i).filter((t) => t - at < 10_000).length), 0);
  const perUid = participants.map((p) => ({
    uid: p.uid,
    total: p.callLog.length,
    busiest10s: busiest(p.callLog.map((c) => c.at).sort((a, b) => a - b)),
    rejected: p.callLog.filter((c) => c.status < 200 || c.status >= 300).map((c) => `${c.route} ${c.status}`)
  }));
  const batches = participants.flatMap((p) => p.pullBatches);
  return {
    maxTotal: Math.max(...perUid.map((u) => u.total)),
    maxBusiest10s: Math.max(...perUid.map((u) => u.busiest10s)),
    rejected: perUid.flatMap((u) => u.rejected.map((r) => `${u.uid} ${r}`)),
    roomErrors: participants.flatMap((p) => p.roomErrors.map((e) => `${p.uid}: ${e}`)),
    pullRequests: batches.length,
    tracksPerPull: { mean: batches.length ? batches.reduce((a, b) => a + b, 0) / batches.length : 0, max: batches.length ? Math.max(...batches) : 0 }
  };
}
