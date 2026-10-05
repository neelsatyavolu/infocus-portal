/**
 * InFocus Meetings end-to-end load / quality test (terminal only, no browser).
 *
 * N fake participants join one throwaway room on the live meeting-room Worker. Each opens one
 * partytracks session, publishes E2EE Opus-sized audio (20 ms) and VP8-shaped video (30 fps at the
 * target bitrate, key frame every 2 s, fragmented into <=1200-byte RTP packets) and pulls every
 * other participant's audio + video: N x (N-1) x 2 inbound tracks through Cloudflare Realtime.
 * It measures join time, loss, latency, jitter, freezes and bitrate, then closes everything and
 * ends the room.
 *
 * All participants run in this one process on one machine, so latency is the round trip
 * machine -> Cloudflare edge -> machine, not users in different places.
 *
 * Run (the secret comes from 1Password at run time; never print it):
 *   MEETING_ROOM_SECRET="$(op --account <account> item get <item> --fields MEETING_ROOM_SECRET --reveal)" \
 *     npm run e2e:meetings
 *
 * Env: MEETING_ROOM_SECRET (required), MEETING_ROOM_URL, SMOKE_ORIGIN (default https://meet.infocuspaly.com),
 *      E2E_PARTICIPANTS (default 4), E2E_SECONDS (default 60), E2E_RELAY=1 (TURN only),
 *      E2E_VIDEO_KBPS (default 1500), E2E_DEBUG=1 (per-second latency timeline, freezes, where audio was lost).
 * Exit code: 0 when every threshold passes, 1 otherwise.
 */
import { randomBytes } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { deriveMeetingKey } from "../src/lib/meetings/client/frame-crypto";
import {
  check,
  checks,
  describePair,
  finish,
  firstTurnUrl,
  info,
  newMeetingId,
  now,
  ORIGIN,
  percentile,
  requireSecret,
  ROOM_URL,
  roomClient,
  sleep,
  STEP_TIMEOUT_MS,
  timeout
} from "./meetings-e2e/common";
import { firstFrames, joinMetrics, senderDrift, trackMetrics, type MeasureWindow, type TrackMetrics } from "./meetings-e2e/metrics";
import { Participant } from "./meetings-e2e/participant";

const PARTICIPANTS = Math.max(2, Number(process.env.E2E_PARTICIPANTS ?? 4));
const SECONDS = Math.max(5, Number(process.env.E2E_SECONDS ?? 60));
const RELAY = process.env.E2E_RELAY === "1";
const VIDEO_KBPS = Number(process.env.E2E_VIDEO_KBPS ?? 1500);
const KEY_FRAME_SECONDS = 2;
const DRAIN_MS = 2000;

const LIMITS = {
  welcomeMs: 1500,
  iceMs: 3000,
  firstFrameMs: 2500,
  audioLossPct: 1,
  audioP95Ms: 150,
  jitterMs: 30,
  videoCompletePct: 98,
  videoP95Ms: 200,
  longestFreezeMs: 500,
  freezesPerMinute: 1,
  bitrateTolerance: 0.15,
  loopLagWarnMs: 20
};

const fmt = (value: number, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : "n/a");
const worst = (values: number[], pick: "max" | "min") => (values.length ? (pick === "max" ? Math.max(...values) : Math.min(...values)) : NaN);
const label = (row: TrackMetrics) => `${row.publisher}->${row.receiver}`;

function worstRow(rows: TrackMetrics[], score: (row: TrackMetrics) => number) {
  return rows.reduce<TrackMetrics | null>((acc, row) => (acc === null || score(row) > score(acc) ? row : acc), null);
}

/** Waits until every receiver has decrypted a first video frame from every publisher (or the step timeout). */
async function waitForAllFirstFrames(participants: Participant[]) {
  const expected = PARTICIPANTS * (PARTICIPANTS - 1);
  const ready = () => participants.reduce((sum, p) => sum + [...p.inbound.values()].filter((i) => i.video.length > 0 && i.audio.length > 0).length, 0);
  const deadline = performance.now() + STEP_TIMEOUT_MS;
  while (ready() < expected && performance.now() < deadline) await sleep(50);
  return { ready: ready(), expected };
}

function reportJoin(participants: Participant[]) {
  const joins = joinMetrics(participants);
  const welcome = worst(joins.map((j) => j.welcomeMs), "max");
  const ice = worst(joins.map((j) => j.iceMs), "max");
  check(`join: ticket -> welcome < ${LIMITS.welcomeMs} ms (worst)`, welcome < LIMITS.welcomeMs, `p50 ${fmt(percentile(joins.map((j) => j.welcomeMs), 50), 0)} ms, worst ${fmt(welcome, 0)} ms`);
  check(`join: ICE + DTLS connected < ${LIMITS.iceMs} ms (worst)`, ice < LIMITS.iceMs, `worst ${fmt(ice, 0)} ms; push request -> connected worst ${fmt(worst(joins.map((j) => j.pushToConnectedMs), "max"), 0)} ms`);

  const firsts = firstFrames(participants);
  for (const kind of ["audio", "video"] as const) {
    const values = firsts.filter((f) => f.kind === kind);
    const fromPublish = worst(values.map((f) => f.fromPublishMs), "max");
    check(
      `join: publish -> first decrypted ${kind} frame < ${LIMITS.firstFrameMs} ms (worst of ${values.length})`,
      values.length === PARTICIPANTS * (PARTICIPANTS - 1) && fromPublish < LIMITS.firstFrameMs,
      `p50 ${fmt(percentile(values.map((f) => f.fromPublishMs), 50), 0)} ms, worst ${fmt(fromPublish, 0)} ms; pull request -> first frame worst ${fmt(worst(values.map((f) => f.fromPullMs), "max"), 0)} ms`
    );
  }
}

/** Where the slowest publish -> first video frame went, plus every signaling call's round trip. */
function reportJoinBreakdown(participants: Participant[]) {
  const byUid = new Map(participants.map((p) => [p.uid, p]));
  const slowest = firstFrames(participants)
    .filter((f) => f.kind === "video")
    .sort((a, b) => b.fromPublishMs - a.fromPublishMs)[0];
  const publisher = slowest && byUid.get(slowest.publisher);
  const inbound = slowest && byUid.get(slowest.receiver)?.inbound.get(slowest.publisher);
  if (slowest && publisher && inbound) {
    const t = publisher.times;
    const first = Math.min(...inbound.video.map((r) => r.arrival));
    info(
      `join breakdown (slowest pair ${slowest.publisher}->${slowest.receiver}): push request -> connected ${fmt(t.connectedAt - t.pushRequestAt, 0)} ms, ` +
        `-> tracks announced ${fmt(t.announcedAt - t.connectedAt, 0)} ms, -> receiver sees them ${fmt(inbound.seenAt - t.announcedAt, 0)} ms, ` +
        `-> receiver starts pull (negotiation queue) ${fmt(inbound.pullRequestAt - inbound.seenAt, 0)} ms, -> first frame ${fmt(first - inbound.pullRequestAt, 0)} ms`
    );
  }
  const routes = new Map<string, number[]>();
  for (const p of participants) for (const [route, times] of p.calls) routes.set(route, [...(routes.get(route) ?? []), ...times]);
  const line = [...routes.entries()].map(([route, times]) => `${route} p50 ${fmt(percentile(times, 50), 0)}/max ${fmt(Math.max(...times), 0)} ms (${times.length})`);
  info(`signaling round trips via the room Worker: ${line.join("; ")}`);
}

function reportAudio(rows: TrackMetrics[]) {
  const audio = rows.filter((r) => r.kind === "audio");
  const loss = worstRow(audio, (r) => 100 - r.completePct);
  const late = worstRow(audio, (r) => r.latency.p95);
  const jittery = worstRow(audio, (r) => r.jitterMs);
  const all = audio.reduce((sum, r) => sum + r.expected, 0);
  const got = audio.reduce((sum, r) => sum + r.received, 0);
  check(`audio: packet loss < ${LIMITS.audioLossPct}% (worst track)`, !!loss && 100 - loss.completePct < LIMITS.audioLossPct, `overall ${fmt(100 - (got / all) * 100, 2)}% of ${all}; worst ${loss ? `${fmt(100 - loss.completePct, 2)}% ${label(loss)}` : "n/a"}`);
  check(`audio: latency p95 < ${LIMITS.audioP95Ms} ms (worst track)`, !!late && late.latency.p95 < LIMITS.audioP95Ms, `median track p50/p95/p99 ${fmt(percentile(audio.map((r) => r.latency.p50), 50))}/${fmt(percentile(audio.map((r) => r.latency.p95), 50))}/${fmt(percentile(audio.map((r) => r.latency.p99), 50))} ms; worst p95 ${late ? `${fmt(late.latency.p95)} ms (p99 ${fmt(late.latency.p99)}) ${label(late)}` : "n/a"}`);
  check(`audio: jitter < ${LIMITS.jitterMs} ms (worst track)`, !!jittery && jittery.jitterMs < LIMITS.jitterMs, `median ${fmt(percentile(audio.map((r) => r.jitterMs), 50), 2)} ms, worst ${jittery ? `${fmt(jittery.jitterMs, 2)} ms ${label(jittery)}` : "n/a"}`);
}

function reportVideo(rows: TrackMetrics[]) {
  const video = rows.filter((r) => r.kind === "video");
  const incomplete = worstRow(video, (r) => 100 - r.completePct);
  const late = worstRow(video, (r) => r.latency.p95);
  const longest = worstRow(video, (r) => r.longestGapMs);
  const freezy = worstRow(video, (r) => r.freezes200);
  const perMinute = (r: TrackMetrics) => r.freezes200 / (SECONDS / 60);
  const bitrateOff = worstRow(video, (r) => Math.abs(r.kbps - VIDEO_KBPS));
  check(`video: complete + decrypted frames >= ${LIMITS.videoCompletePct}% (worst track)`, !!incomplete && incomplete.completePct >= LIMITS.videoCompletePct, `worst ${incomplete ? `${fmt(incomplete.completePct, 2)}% (${incomplete.received}/${incomplete.expected}) ${label(incomplete)}` : "n/a"}`);
  check(`video: frame latency p95 < ${LIMITS.videoP95Ms} ms (worst track)`, !!late && late.latency.p95 < LIMITS.videoP95Ms, `median track p50/p95/p99 ${fmt(percentile(video.map((r) => r.latency.p50), 50))}/${fmt(percentile(video.map((r) => r.latency.p95), 50))}/${fmt(percentile(video.map((r) => r.latency.p99), 50))} ms; worst p95 ${late ? `${fmt(late.latency.p95)} ms (p99 ${fmt(late.latency.p99)}) ${label(late)}` : "n/a"}`);
  info(`video: inter-frame arrival p50 ${fmt(percentile(video.map((r) => r.interval.p50), 50))} ms, p95 (worst track) ${fmt(worst(video.map((r) => r.interval.p95), "max"))} ms`);
  check(`video: no freeze > ${LIMITS.longestFreezeMs} ms`, !!longest && longest.longestGapMs <= LIMITS.longestFreezeMs, `longest gap ${longest ? `${fmt(longest.longestGapMs, 0)} ms ${label(longest)}` : "n/a"}`);
  check(`video: <= ${LIMITS.freezesPerMinute} freeze > 200 ms per track per minute`, !!freezy && perMinute(freezy) <= LIMITS.freezesPerMinute, `total ${video.reduce((s, r) => s + r.freezes200, 0)} across ${video.length} tracks; worst ${freezy ? `${freezy.freezes200} (${fmt(perMinute(freezy), 2)}/min) ${label(freezy)}` : "n/a"}`);
  check(`video: receive bitrate within ±${LIMITS.bitrateTolerance * 100}% of ${VIDEO_KBPS} kbps (every track)`, !!bitrateOff && Math.abs(bitrateOff.kbps - VIDEO_KBPS) <= VIDEO_KBPS * LIMITS.bitrateTolerance, `median ${fmt(percentile(video.map((r) => r.kbps), 50), 0)} kbps, furthest ${bitrateOff ? `${fmt(bitrateOff.kbps, 0)} kbps ${label(bitrateOff)}` : "n/a"}`);
}

function reportIntegrity(rows: TrackMetrics[], participants: Participant[]) {
  const expectedTracks = PARTICIPANTS * (PARTICIPANTS - 1) * 2;
  const live = rows.filter((r) => r.received > 0).length;
  check(`tracks: ${expectedTracks} inbound tracks carried media`, live === expectedTracks, `${live}/${expectedTracks}`);
  // Decrypt failures are counted per inbound pair (audio + video share the counter).
  const failures = participants.reduce((sum, p) => sum + [...p.inbound.values()].reduce((s, i) => s + i.decryptFailures, 0), 0);
  const integrity = participants.flatMap((p) => [...p.inbound.values()].flatMap((i) => i.integrityFailures));
  check("e2ee: decrypt failures = 0", failures === 0, `${failures} failures`);
  check("e2ee: payload integrity (counter, kind, padding)", integrity.length === 0, integrity.length ? integrity.slice(0, 5).join(", ") : "all frames intact");
  const errors = participants.flatMap((p) => p.errors);
  check("harness: no signaling or send errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
}

function reportContext(participants: Participant[], window: MeasureWindow, loopLagP95: number, loopLagMax: number) {
  const pairs = [...new Set(participants.map((p) => describePair(p.pair)))];
  info(`network: candidate pairs ${pairs.join("; ")}`);
  if (participants.some((p) => p.pair?.local === "relay")) info(`network: TURN URL in use ${firstTurnUrl(participants[0]!.iceServers) ?? "?"}`);
  const drift = senderDrift(participants, window);
  info(`harness: sender pacing drift p50 ${fmt(drift.p50, 2)} ms, p95 ${fmt(drift.p95, 2)} ms, max ${fmt(drift.max)} ms`);
  info(`harness: event-loop lag p95 ${fmt(loopLagP95, 2)} ms, max ${fmt(loopLagMax)} ms${loopLagP95 > LIMITS.loopLagWarnMs ? "  WARNING: harness CPU-bound, latency numbers include it" : ""}`);
  info(`harness: key frames sent on PLI/FIR ${participants.reduce((s, p) => s + p.keyFramesOnRequest, 0)}`);
}

/** E2E_DEBUG=1: per-second worst latency and loss across all tracks, to see whether stalls are shared. */
function debugTimeline(participants: Participant[], window: MeasureWindow) {
  const buckets = new Map<number, { worst: number; count: number }>();
  for (const p of participants) {
    for (const inbound of p.inbound.values()) {
      for (const r of [...inbound.audio, ...inbound.video]) {
        if (r.sentAt < window.start || r.sentAt >= window.end) continue;
        const second = Math.floor((r.sentAt - window.start) / 1000);
        const bucket = buckets.get(second) ?? { worst: 0, count: 0 };
        buckets.set(second, { worst: Math.max(bucket.worst, r.arrival - r.sentAt), count: bucket.count + 1 });
      }
    }
  }
  const line = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([s, b]) => `${s}:${fmt(b.worst, 0)}/${b.count}`);
  info(`debug: per-second worst latency ms / frames received: ${line.join(" ")}`);
  // Audio loss: lost at every receiver (upstream: publisher -> SFU) vs at some receivers (downstream).
  for (const publisher of participants) {
    const sent = publisher.sent.audio.filter((f) => f.sentAt >= window.start && f.sentAt < window.end).map((f) => f.counter);
    const lostBy = participants
      .filter((p) => p !== publisher)
      .map((p) => {
        const got = new Set((p.inbound.get(publisher.uid)?.audio ?? []).map((r) => r.counter));
        return new Set(sent.filter((c) => !got.has(c)));
      });
    const union = new Set(lostBy.flatMap((set) => [...set]));
    const everywhere = [...union].filter((c) => lostBy.every((set) => set.has(c)));
    const sample = [...union].sort((a, b) => a - b).slice(0, 12);
    info(`debug: ${publisher.uid} audio lost: ${union.size} distinct counters, ${everywhere.length} at every receiver; e.g. ${sample.join(",")}`);
  }
  for (const p of participants) {
    for (const inbound of p.inbound.values()) {
      const arrivals = inbound.video.filter((r) => r.sentAt >= window.start && r.sentAt < window.end).map((r) => r.arrival).sort((a, b) => a - b);
      const events = arrivals.slice(1).flatMap((t, i) => (t - arrivals[i]! > 200 ? [`+${fmt((arrivals[i]! - window.start) / 1000)}s ${fmt(t - arrivals[i]!, 0)}ms`] : []));
      if (events.length) info(`debug: freeze ${inbound.publisher}->${p.uid}: ${events.join(", ")}`);
    }
  }
}

async function main() {
  requireSecret();
  const room = roomClient(newMeetingId("e2e"));
  console.log(
    `Meetings e2e load: ${ROOM_URL}, meeting ${room.meetingId}, Origin ${ORIGIN}\n` +
      `${PARTICIPANTS} participants, ${SECONDS}s, video ${VIDEO_KBPS} kbps, ICE ${RELAY ? "relay only (TURN)" : "all"}\n` +
      "Note: every participant runs on this machine; latency = machine -> Cloudflare edge -> machine.\n"
  );
  const key = await deriveMeetingKey(new Uint8Array(randomBytes(32)), "frame");
  const participants = Array.from(
    { length: PARTICIPANTS },
    (_, i) =>
      new Participant({ room, uid: `e2e-${i + 1}`, role: i === 0 ? "host" : "member", key, relay: RELAY, videoKbps: VIDEO_KBPS, keyFrameSeconds: KEY_FRAME_SECONDS, log: info })
  );
  const loop = monitorEventLoopDelay({ resolution: 10 });
  try {
    await Promise.all(participants.map(async (p) => {
      await p.join();
      await p.publish();
    }));
    const { ready, expected } = await waitForAllFirstFrames(participants);
    info(`all joined; ${ready}/${expected} publisher->receiver pairs flowing. Measuring ${SECONDS}s…`);
    loop.enable();
    const window: MeasureWindow = { start: now(), end: 0 };
    await sleep(SECONDS * 1000);
    window.end = now();
    loop.disable();
    participants.forEach((p) => p.stop());
    await sleep(DRAIN_MS);

    reportJoin(participants);
    reportJoinBreakdown(participants);
    const rows = trackMetrics(participants, window);
    reportAudio(rows);
    reportVideo(rows);
    reportIntegrity(rows, participants);
    reportContext(participants, window, loop.percentile(95) / 1e6, loop.max / 1e6);
    if (process.env.E2E_DEBUG === "1") debugTimeline(participants, window);
  } catch (error) {
    check("flow completed", false, error instanceof Error ? error.message : String(error));
  } finally {
    const closed = await timeout(Promise.all(participants.map((p) => p.leave())), STEP_TIMEOUT_MS, "leave").catch((error: Error) => [error.message]);
    const ended = await room.end().catch(() => 0);
    check("cleanup: tracks closed and room ended", ended >= 200 && ended < 300 && closed.every((c) => c === null || c === "200"), `tracks/close ${closed.join(",")}; ended ${ended}`);
  }
  if (checks.length === 0) check("ran", false);
  finish();
}

void main();
