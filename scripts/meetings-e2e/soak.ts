/**
 * E2E_SCENARIO=soak: a long meeting with disruptions on a timeline, reported per 5-minute window.
 * Defaults: 4 participants, E2E_SECONDS=1800. Shorter runs scale the whole timeline down.
 *
 * Timeline (at 30 min):
 * - every 5 min: one participant's socket drops (network blip) and reconnects like RoomSocket;
 * - every 7 min: one participant leaves and rejoins 5 s later (fresh ticket, fresh keys);
 * - 12 min: rekey 0 -> 1 (Portal event; everyone fetches the key; senders switch after 2 s);
 * - 18-23 min: one participant camera off + muted (idle media), then back on.
 */
import { randomBytes } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { deriveMeetingKey } from "../../src/lib/meetings/client/frame-crypto";
import { check, info, newMeetingId, now, percentile, roomClient, sleep } from "./common";
import type { FrameKey } from "./keys";
import { GENERATION_STRIDE, Participant } from "./participant";
import { prune, rekeyStats, windowRow, type Interval, type WindowRow } from "./soak-metrics";

const FULL_SECONDS = 1800;
const RECOVERY_TIMEOUT_MS = 30_000;
const RECOVERY_LIMIT_MS = 5000;
const REJOIN_PAUSE_MS = 5000;
const DRAIN_MS = 3000;
const RESUME_LIMIT_MS = 2000;
const LIMITS = { audioLossPct: 1, audioP95Ms: 150, jitterMs: 30, videoCompletePct: 98, longestGapMs: 500 };

type Options = { relay: boolean; videoKbps: number };
/** `background` events (rekey analysis, the 5-minute idle) run alongside the rest of the timeline. */
type Event = { at: number; label: string; run: () => Promise<void>; background?: boolean };

const fmt = (value: number, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : "-");
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Media flows both ways between `x` (new session) and everyone else present. */
async function waitRecovered(x: Participant, everyone: Participant[]) {
  const others = everyone.filter((p) => p !== x && p.socket?.isOpen && p.pc);
  const base = x.generation * GENERATION_STRIDE;
  const flowing = () =>
    others.every((o) => {
      const from = x.inbound.get(o.uid);
      const to = o.inbound.get(x.uid);
      const fresh = (records: { arrival: number }[] | undefined) => (records ?? []).some((r) => r.arrival >= x.times.connectedAt);
      const mine = (records: { counter: number }[] | undefined) => (records ?? []).some((r) => r.counter >= base);
      return fresh(from?.audio) && fresh(from?.video) && mine(to?.audio) && mine(to?.video);
    });
  const deadline = now() + RECOVERY_TIMEOUT_MS;
  while (!flowing() && now() < deadline) await sleep(50);
  return flowing() ? now() : null;
}

function printRow(row: WindowRow, notes: string[]) {
  const cells = [
    `${row.index}`.padStart(2),
    `${fmt(row.audioLossPct, 2)}/${fmt(row.audioLossWorstPct, 2)}`.padStart(11),
    fmt(row.audioP95WorstMs, 1).padStart(6),
    fmt(row.jitterWorstMs, 1).padStart(5),
    fmt(row.videoCompleteWorstPct, 2).padStart(7),
    `${row.freezes}/${fmt(row.longestGapMs)}`.padStart(8),
    `${row.decryptFailures}`.padStart(4),
    `${row.proxyErrors}/${row.roomErrors}`.padStart(5),
    `${row.pulls}:${fmt(row.renegotiationP50Ms)}/${fmt(row.renegotiationMaxMs)}`.padStart(13),
    `${row.transceivers.total}/${row.transceivers.active}`.padStart(6),
    fmt(row.loopLagP95Ms, 1).padStart(5)
  ];
  console.log(`  ${cells.join(" | ")} | ${notes.join("; ")}`);
}

export async function runSoakScenario(options: Options) {
  const seconds = Number(process.env.E2E_SECONDS ?? FULL_SECONDS);
  const count = Math.max(3, Number(process.env.E2E_PARTICIPANTS ?? 4));
  const scale = seconds / FULL_SECONDS;
  const windowMs = 300_000 * scale;
  const room = roomClient(newMeetingId("soak"));
  const keys: FrameKey[] = [{ epoch: 0, key: await deriveMeetingKey(new Uint8Array(randomBytes(32)), "frame") }];
  keys.push({ epoch: 1, key: await deriveMeetingKey(new Uint8Array(randomBytes(32)), "frame") });
  let currentEpoch = 0;
  const fetchKey = async (epoch: number) => keys[epoch] ?? Promise.reject(new Error(`no key for epoch ${epoch}`));
  const participants = Array.from(
    { length: count },
    (_, i) =>
      new Participant({
        room,
        uid: `soak-${i + 1}`,
        role: i === 0 ? "host" : "member",
        key: keys[0]!.key,
        relay: options.relay,
        videoKbps: options.videoKbps,
        keyFrameSeconds: 2,
        fetchKey,
        log: info
      })
  );
  const outages: Interval[] = [];
  const idles: Interval[] = [];
  const notes = new Map<number, string[]>();
  const recoveries: { kind: string; uid: string; ms: number | null }[] = [];
  const lag = monitorEventLoopDelay({ resolution: 10 });
  console.log(`\n== soak (meeting ${room.meetingId}): ${count} participants, ${secs(seconds * 1000)}, windows of ${secs(windowMs)}`);

  for (const p of participants) {
    await p.join();
    await p.publish();
  }
  // Windows start once every pair carries media (the last joiner's tracks are still being pulled).
  for (const p of participants) await waitRecovered(p, participants);
  const t0 = now();
  const windowOf = (t: number) => Math.floor((t - t0) / windowMs) + 1;
  const note = (t: number, text: string) => {
    notes.set(windowOf(t), [...(notes.get(windowOf(t)) ?? []), text]);
  };
  lag.enable();

  const disrupt = async (kind: "blip" | "rejoin", p: Participant) => {
    const start = now();
    const outage: Interval = { uid: p.uid, start, end: Number.POSITIVE_INFINITY };
    outages.push(outage);
    let clickAt = start;
    if (kind === "blip") {
      const result = await p.blipAndReconnect();
      if (!result.ok) note(start, `${p.uid} blip: reconnect FAILED ${result.statuses.join(",")}`);
    } else {
      await p.leaveLikeBrowser();
      await sleep(REJOIN_PAUSE_MS);
      clickAt = now();
      p.resetKeys(keys[currentEpoch]!);
      await p.join();
      await p.publish();
    }
    const recovered = await waitRecovered(p, participants);
    outage.end = recovered ?? now();
    const ms = recovered === null ? null : recovered - clickAt;
    recoveries.push({ kind, uid: p.uid, ms });
    note(start, `${kind} ${p.uid} ${ms === null ? "NOT recovered" : secs(ms)}`);
  };

  let rekey: ReturnType<typeof rekeyStats> | null = null;
  let rekeyStatus = 0;
  const idle = { uid: "", connectedThroughout: true, socketOpenThroughout: true, resumeMs: [] as number[] };
  const at = (fullSeconds: number) => fullSeconds * 1000 * scale;
  const events: Event[] = [
    ...[1, 2, 3, 4, 5].map((k) => ({ at: at(300 * k), label: "blip", run: () => disrupt("blip", participants[(k - 1) % count]!) })),
    ...[1, 2, 3, 4].map((k) => ({ at: at(420 * k), label: "rejoin", run: () => disrupt("rejoin", participants[(k + 1) % count]!) })),
    {
      at: at(720),
      label: "rekey",
      background: true,
      run: async () => {
        const rekeyAt = now();
        currentEpoch = 1;
        rekeyStatus = await room.event({ t: "rekey", epoch: 1 });
        note(rekeyAt, `rekey 0->1 (${rekeyStatus})`);
        await sleep(16_000);
        rekey = rekeyStats(participants, rekeyAt, 1);
      }
    },
    {
      at: at(1080),
      label: "idle",
      background: true,
      run: async () => {
        const p = participants[1 % count]!;
        idle.uid = p.uid;
        const start = now();
        const interval: Interval = { uid: p.uid, start, end: Number.POSITIVE_INFINITY };
        idles.push(interval);
        p.setIdle(true);
        note(start, `${p.uid} camera off + muted`);
        const end = start + at(300);
        while (now() < end) {
          if (p.pc?.connectionState !== "connected") idle.connectedThroughout = false;
          if (!p.socket?.isOpen) idle.socketOpenThroughout = false;
          await sleep(Math.min(5000, Math.max(0, end - now())));
        }
        const resumeAt = now();
        interval.end = resumeAt + 2000;
        p.setIdle(false);
        note(resumeAt, `${p.uid} back on`);
        await sleep(3000);
        for (const r of participants.filter((o) => o !== p)) {
          const first = (r.inbound.get(p.uid)?.video ?? []).filter((v) => v.sentAt >= resumeAt).sort((a, b) => a.arrival - b.arrival)[0];
          idle.resumeMs.push(first ? first.arrival - resumeAt : Number.POSITIVE_INFINITY);
        }
      }
    }
  ]
    .filter((e) => e.at < seconds * 1000 - 20_000)
    .sort((a, b) => a.at - b.at);

  const background: Promise<void>[] = [];
  const timeline = (async () => {
    for (const event of events) {
      await sleep(Math.max(0, t0 + event.at - now()));
      const run = event.run().catch((error: Error) => note(now(), `${event.label} error: ${error.message}`));
      if (event.background) background.push(run);
      else await run;
    }
  })();

  const rows: WindowRow[] = [];
  const windows = Math.ceil((seconds * 1000) / windowMs);
  console.log("  win | audio loss % | a p95 | jit  | v cmpl% | frz/max | dec | px/rm | pulls:p50/max | trx   | lag   | events");
  for (let k = 1; k <= windows; k += 1) {
    const end = t0 + Math.min(k * windowMs, seconds * 1000);
    await sleep(Math.max(0, end + DRAIN_MS - now()));
    const row = windowRow(k, participants, { start: end - windowMs, end }, outages, idles, lag.percentile(95) / 1e6);
    lag.reset();
    rows.push(row);
    printRow(row, notes.get(k) ?? []);
    prune(participants, end - 10_000);
  }
  await timeline;
  await Promise.all(background);
  lag.disable();

  reportSoak(rows, recoveries, rekey, rekeyStatus, idle, participants);
  await Promise.all(participants.map((p) => p.leave().catch(() => null)));
  const ended = await room.end().catch(() => 0);
  check("soak: cleanup, room ended", ended >= 200 && ended < 300, String(ended));
  return room.meetingId;
}

function reportSoak(
  rows: WindowRow[],
  recoveries: { kind: string; uid: string; ms: number | null }[],
  rekey: ReturnType<typeof rekeyStats> | null,
  rekeyStatus: number,
  idle: { uid: string; connectedThroughout: boolean; socketOpenThroughout: boolean; resumeMs: number[] },
  participants: Participant[]
) {
  const worst = (pick: (r: WindowRow) => number, max = true) =>
    rows.reduce((best, r) => ((max ? pick(r) > pick(best) : pick(r) < pick(best)) ? r : best), rows[0]!);
  const at = (r: WindowRow, value: string) => `worst window ${r.index}: ${value}`;
  const loss = worst((r) => r.audioLossWorstPct);
  check(`soak: audio loss < ${LIMITS.audioLossPct}% every window (worst track)`, loss.audioLossWorstPct < LIMITS.audioLossPct, at(loss, `${fmt(loss.audioLossWorstPct, 2)}%`));
  const late = worst((r) => r.audioP95WorstMs);
  check(`soak: audio p95 < ${LIMITS.audioP95Ms} ms every window`, late.audioP95WorstMs < LIMITS.audioP95Ms, at(late, `${fmt(late.audioP95WorstMs, 1)} ms`));
  const jit = worst((r) => r.jitterWorstMs);
  check(`soak: jitter < ${LIMITS.jitterMs} ms every window`, jit.jitterWorstMs < LIMITS.jitterMs, at(jit, `${fmt(jit.jitterWorstMs, 1)} ms`));
  const video = worst((r) => r.videoCompleteWorstPct, false);
  check(`soak: video complete >= ${LIMITS.videoCompletePct}% every window`, video.videoCompleteWorstPct >= LIMITS.videoCompletePct, at(video, `${fmt(video.videoCompleteWorstPct, 2)}%`));
  const gap = worst((r) => r.longestGapMs);
  check(`soak: no video freeze > ${LIMITS.longestGapMs} ms outside disruptions`, gap.longestGapMs <= LIMITS.longestGapMs, at(gap, `${fmt(gap.longestGapMs)} ms, ${rows.reduce((s, r) => s + r.freezes, 0)} freezes > 200 ms in total`));
  check("soak: decrypt failures = 0", rows.every((r) => r.decryptFailures === 0), rows.map((r) => r.decryptFailures).join(","));
  check("soak: no proxy errors / room errors", rows.every((r) => r.proxyErrors + r.roomErrors === 0), rows.map((r) => `${r.proxyErrors}/${r.roomErrors}`).join(","));

  for (const kind of ["blip", "rejoin"]) {
    const list = recoveries.filter((r) => r.kind === kind);
    const times = list.map((r) => r.ms ?? Number.POSITIVE_INFINITY);
    check(
      `soak: every ${kind} recovers (media both ways) < ${RECOVERY_LIMIT_MS / 1000} s`,
      list.length > 0 && times.every((t) => t < RECOVERY_LIMIT_MS),
      list.map((r) => `${r.uid} ${r.ms === null ? "never" : secs(r.ms)}`).join(", ")
    );
  }
  if (rekey) {
    const r: ReturnType<typeof rekeyStats> = rekey;
    check("soak: rekey event accepted", rekeyStatus >= 200 && rekeyStatus < 300, String(rekeyStatus));
    check("soak: rekey: decrypt failures = 0 (rekey -1 s .. +15 s)", r.failures === 0, `${r.failures}`);
    check("soak: rekey: longest audio gap < 200 ms", r.worstGapMs < 200, `${fmt(r.worstGapMs)} ms over ${r.tracks} tracks`);
    check(
      "soak: rekey: every sender switched to epoch 1 within 2-5 s",
      r.switchMs.length === r.tracks && r.switchMs.every((t) => t >= 1900 && t < 5000),
      `${r.switchMs.length}/${r.tracks} tracks, switch after ${fmt(Math.min(...r.switchMs))}..${fmt(Math.max(...r.switchMs))} ms (p50 ${fmt(percentile(r.switchMs, 50))})`
    );
  }
  if (idle.uid) {
    check(`soak: idle ${idle.uid}: peer connection stayed connected, socket open`, idle.connectedThroughout && idle.socketOpenThroughout, `pc ${idle.connectedThroughout}, socket ${idle.socketOpenThroughout}`);
    check(
      `soak: idle ${idle.uid}: full video back at every receiver < ${RESUME_LIMIT_MS} ms`,
      idle.resumeMs.every((t) => t < RESUME_LIMIT_MS),
      idle.resumeMs.map((t) => fmt(t)).join(", ") + " ms"
    );
  }
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const reneg = rows.filter((r) => Number.isFinite(r.renegotiationP50Ms));
  check(
    "soak: renegotiation time does not grow (last window p50 <= 2x first + 200 ms)",
    reneg.length < 2 || reneg[reneg.length - 1]!.renegotiationP50Ms <= 2 * reneg[0]!.renegotiationP50Ms + 200,
    reneg.map((r) => `w${r.index} ${fmt(r.renegotiationP50Ms)}`).join(", ")
  );
  check(
    "soak: active transceivers per PC stay bounded (<= 2 per participant)",
    last.transceivers.active <= 2 * participants.length,
    `first window ${first.transceivers.total}/${first.transceivers.active}, last ${last.transceivers.total}/${last.transceivers.active} (total/active)`
  );
  const unplanned = participants.flatMap((p) => p.reconnects.filter((r) => r.reason !== "blip").map((r) => `${p.uid} ${r.reason}: ${r.result.ok ? "ok" : "FAILED"}`));
  info(`unplanned reconnects (room closed the socket): ${unplanned.join(", ") || "none"}`);
  const unexpectedCloses = participants.flatMap((p) => p.sockets.flatMap((s) => s.closes.filter((c) => !c.ours).map((c) => `${p.uid} ${c.code}`)));
  check("soak: no socket closed by the room", unexpectedCloses.length === 0, unexpectedCloses.join(", ") || "none");
  const errors = participants.flatMap((p) => p.errors);
  check("soak: no harness pull/close/send errors", errors.length === 0, errors.slice(0, 4).join(" | ") || "none");
}
