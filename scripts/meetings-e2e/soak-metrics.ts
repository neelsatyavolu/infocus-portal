/**
 * Per-window metrics for the soak test. Frames sent while the publisher or the receiver was
 * offline (a blip or a leave, until media flowed again) are excluded from loss and freeze counts;
 * the recovery time of each disruption is reported separately. The idle publisher's ~1 fps video
 * is excluded from freeze counts only.
 */
import { percentile, type Kind } from "./common";
import type { Participant } from "./participant";

export type Interval = { uid: string; start: number; end: number };

export type WindowRow = {
  index: number;
  audioLossPct: number;
  audioLossWorstPct: number;
  audioP95WorstMs: number;
  jitterWorstMs: number;
  videoCompleteWorstPct: number;
  freezes: number;
  longestGapMs: number;
  decryptFailures: number;
  proxyErrors: number;
  roomErrors: number;
  pulls: number;
  renegotiationP50Ms: number;
  renegotiationMaxMs: number;
  transceivers: { total: number; active: number };
  loopLagP95Ms: number;
};

const FREEZE_MS = 200;
const inside = (t: number, intervals: readonly Interval[]) => intervals.some((i) => t >= i.start && t <= i.end);
const overlaps = (a: number, b: number, intervals: readonly Interval[]) => intervals.some((i) => a <= i.end && b >= i.start);

function rfc3550Jitter(records: readonly { sentAt: number; arrival: number }[]) {
  const ordered = [...records].sort((a, b) => a.arrival - b.arrival);
  let jitter = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const d = ordered[i]!.arrival - ordered[i - 1]!.arrival - (ordered[i]!.sentAt - ordered[i - 1]!.sentAt);
    jitter += (Math.abs(d) - jitter) / 16;
  }
  return jitter;
}

type TrackStat = { kind: Kind; sent: number; got: number; p95: number; jitter: number; freezes: number; longestGap: number };

function trackStat(
  receiver: Participant,
  publisher: Participant,
  kind: Kind,
  window: { start: number; end: number },
  outages: readonly Interval[],
  idles: readonly Interval[]
): TrackStat | null {
  const offline = outages.filter((o) => o.uid === publisher.uid || o.uid === receiver.uid);
  const sent = publisher.sent[kind].filter((f) => f.sentAt >= window.start && f.sentAt < window.end && !inside(f.sentAt, offline));
  if (!sent.length) return null;
  const counters = new Set(sent.map((f) => f.counter));
  const inbound = receiver.inbound.get(publisher.uid);
  const records = (kind === "audio" ? inbound?.audio : inbound?.video) ?? [];
  const unique = new Map<number, { sentAt: number; arrival: number }>();
  for (const r of records) if (counters.has(r.counter) && !unique.has(r.counter)) unique.set(r.counter, r);
  const got = [...unique.values()];
  const arrivals = got.map((r) => r.arrival).sort((a, b) => a - b);
  const skip = [...offline, ...(kind === "video" ? idles.filter((i) => i.uid === publisher.uid) : [])];
  const gaps = arrivals.slice(1).flatMap((t, i) => (overlaps(arrivals[i]!, t, skip) ? [] : [t - arrivals[i]!]));
  return {
    kind,
    sent: sent.length,
    got: got.length,
    p95: percentile(got.map((r) => r.arrival - r.sentAt), 95),
    jitter: kind === "audio" ? rfc3550Jitter(got) : NaN,
    freezes: gaps.filter((g) => g > FREEZE_MS).length,
    longestGap: gaps.length ? Math.max(...gaps) : 0
  };
}

export function windowRow(
  index: number,
  participants: readonly Participant[],
  window: { start: number; end: number },
  outages: readonly Interval[],
  idles: readonly Interval[],
  loopLagP95Ms: number
): WindowRow {
  const stats = participants.flatMap((receiver) =>
    participants.flatMap((publisher) =>
      publisher === receiver
        ? []
        : (["audio", "video"] as const).flatMap((kind) => trackStat(receiver, publisher, kind, window, outages, idles) ?? [])
    )
  );
  const audio = stats.filter((s) => s.kind === "audio");
  const video = stats.filter((s) => s.kind === "video");
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const inWindow = (t: number) => t >= window.start && t < window.end;
  const pulls = participants.flatMap((p) => p.pullTimes.filter((t) => inWindow(t.at)));
  const counts = participants.map((p) => p.transceiverCount());
  return {
    index,
    audioLossPct: 100 - (sum(audio.map((s) => s.got)) / Math.max(1, sum(audio.map((s) => s.sent)))) * 100,
    audioLossWorstPct: Math.max(0, ...audio.map((s) => 100 - (s.got / s.sent) * 100)),
    audioP95WorstMs: Math.max(0, ...audio.map((s) => s.p95).filter(Number.isFinite)),
    jitterWorstMs: Math.max(0, ...audio.map((s) => s.jitter)),
    videoCompleteWorstPct: Math.min(100, ...video.map((s) => (s.got / s.sent) * 100)),
    freezes: sum(video.map((s) => s.freezes)),
    longestGapMs: Math.max(0, ...video.map((s) => s.longestGap)),
    decryptFailures: sum(participants.flatMap((p) => [...p.inbound.values()].map((i) => i.failureTimes.filter(inWindow).length))),
    proxyErrors: sum(participants.map((p) => p.callLog.filter((c) => inWindow(c.at) && (c.status < 200 || c.status >= 300)).length)),
    roomErrors: sum(participants.map((p) => p.roomErrors.filter((e) => inWindow(e.at)).length)),
    pulls: pulls.length,
    renegotiationP50Ms: percentile(pulls.map((t) => t.ms), 50),
    renegotiationMaxMs: pulls.length ? Math.max(...pulls.map((t) => t.ms)) : NaN,
    transceivers: { total: Math.max(...counts.map((c) => c.total)), active: Math.max(...counts.map((c) => c.active)) },
    loopLagP95Ms
  };
}

/** Drops records older than `before` so a 30-minute run stays small in memory. */
export function prune(participants: readonly Participant[], before: number) {
  for (const p of participants) {
    p.sent.audio = p.sent.audio.filter((f) => f.sentAt >= before);
    p.sent.video = p.sent.video.filter((f) => f.sentAt >= before);
    for (const inbound of p.inbound.values()) {
      inbound.audio = inbound.audio.filter((r) => r.sentAt >= before);
      inbound.video = inbound.video.filter((r) => r.sentAt >= before);
      inbound.failureTimes = inbound.failureTimes.filter((t) => t >= before);
    }
  }
}

/** Decrypt failures, the longest audio gap per track, and when each publisher's frames switched epoch. */
export function rekeyStats(participants: readonly Participant[], rekeyAt: number, epochByte: number) {
  const from = rekeyAt - 1000;
  const to = rekeyAt + 15_000;
  const failures = participants.reduce(
    (sum, p) => sum + [...p.inbound.values()].reduce((s, i) => s + i.failureTimes.filter((t) => t >= from && t <= to).length, 0),
    0
  );
  const gaps: number[] = [];
  const switches: number[] = [];
  for (const receiver of participants) {
    for (const inbound of receiver.inbound.values()) {
      const arrivals = inbound.audio.filter((r) => r.arrival >= from && r.arrival <= to).map((r) => r.arrival).sort((a, b) => a - b);
      gaps.push(arrivals.slice(1).reduce((max, t, i) => Math.max(max, t - arrivals[i]!), 0));
      const first = inbound.audio.filter((r) => r.epoch === epochByte && r.sentAt >= rekeyAt).sort((a, b) => a.sentAt - b.sentAt)[0];
      if (first) switches.push(first.sentAt - rekeyAt);
    }
  }
  return { failures, worstGapMs: Math.max(0, ...gaps), switchMs: switches, tracks: gaps.length };
}
