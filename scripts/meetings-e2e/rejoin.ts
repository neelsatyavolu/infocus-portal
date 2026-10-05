/**
 * E2E_SCENARIO=rejoin: leave + rejoin repro for "we left and rejoined and can't hear each other".
 *
 * Variant "all": A, B, C talk; A, B, C leave one after another ({t:"leave"}, close socket + PC, like
 * useMeetingCall.leave); within ~10 s all three rejoin with fresh tickets, new sockets and new media
 * sessions; media must flow again between every pair.
 * Variant "one": only A leaves and rejoins while B and C stay.
 * Every welcome / participant / left message is logged with the advertised tracks per uid, marking
 * session ids that belong to an earlier (dead) session of that uid as STALE.
 */
import type { MeetingParticipantView, MeetingServerMessage } from "../../src/lib/meetings/protocol";
import { check, info, newMeetingId, now, roomClient, sleep, type Kind } from "./common";
import { signalingStats } from "./metrics";
import { Participant } from "./participant";

const FLOW_SECONDS = 10;
const FLOW_TIMEOUT_MS = 20_000;
const MIN_FLOW_PCT = 95;

type Options = { key: CryptoKey; relay: boolean; videoKbps: number };

function trackLabel(view: MeetingParticipantView, byUid: Map<string, Participant>) {
  const owner = byUid.get(view.uid);
  const kinds = (["audio", "video"] as const).flatMap((kind) => {
    const meta = view.tracks[kind];
    if (!meta?.sessionId) return [];
    const index = owner?.sessions.indexOf(meta.sessionId) ?? -1;
    const current = owner && index === owner.sessions.length - 1;
    const tag = index < 0 ? "UNKNOWN" : current ? `s${index + 1}` : `STALE s${index + 1}`;
    return [`${kind[0]}:${tag}`];
  });
  return `${view.uid}{${kinds.join(" ") || "no tracks"}}`;
}

/** With `focus`, only messages about those uids (seen by `observer`) and their own welcomes are logged. */
function messageLogger(byUid: Map<string, Participant>, start: number, focus?: { uids: Set<string>; observer: string }) {
  return (uid: string, message: MeetingServerMessage) => {
    if (focus) {
      const subject = message.t === "participant" ? message.participant.uid : message.t === "left" ? message.uid : null;
      const relevant = message.t === "welcome" ? focus.uids.has(uid) : uid === focus.observer && (!subject || focus.uids.has(subject));
      if (!relevant) return;
    }
    const at = `+${((now() - start) / 1000).toFixed(1)}s`;
    if (message.t === "welcome") info(`${at} [${uid}] welcome: ${message.participants.map((p) => trackLabel(p, byUid)).join(", ")}`);
    else if (message.t === "participant") info(`${at} [${uid}] participant ${trackLabel(message.participant, byUid)}`);
    else if (message.t === "left") info(`${at} [${uid}] left ${message.uid}`);
    else if (message.t === "error") info(`${at} [${uid}] error: ${message.message}`);
  };
}

/** Frames from `publisher` with send time >= since that `receiver` decrypted. */
function receivedSince(receiver: Participant, publisher: Participant, kind: Kind, since: number) {
  const inbound = receiver.inbound.get(publisher.uid);
  const records = kind === "audio" ? inbound?.audio : inbound?.video;
  return (records ?? []).filter((r) => r.sentAt >= since).length;
}

async function waitForFlow(present: Participant[], since: number) {
  const deadline = performance.now() + FLOW_TIMEOUT_MS;
  const flowing = () =>
    present.every((r) => present.every((p) => p === r || (receivedSince(r, p, "audio", since) >= 10 && receivedSince(r, p, "video", since) >= 5)));
  while (!flowing() && performance.now() < deadline) await sleep(100);
  return { ok: flowing(), ms: now() - since };
}

/** Every ordered pair carried >= 95% of the audio and video frames sent in the window, all decrypted. */
function assertFlow(label: string, present: Participant[], start: number, end: number) {
  const failures = (p: Participant) => [...p.inbound.values()].reduce((sum, i) => sum + i.decryptFailures + i.integrityFailures.length, 0);
  const lines: string[] = [];
  let ok = true;
  for (const receiver of present) {
    for (const publisher of present) {
      if (receiver === publisher) continue;
      const parts = (["audio", "video"] as const).map((kind) => {
        const sent = publisher.sent[kind].filter((f) => f.sentAt >= start && f.sentAt < end).map((f) => f.counter);
        const got = new Set(
          (kind === "audio" ? receiver.inbound.get(publisher.uid)?.audio : receiver.inbound.get(publisher.uid)?.video)?.map((r) => r.counter) ?? []
        );
        const pct = sent.length ? (sent.filter((c) => got.has(c)).length / sent.length) * 100 : 0;
        if (pct < MIN_FLOW_PCT) ok = false;
        return `${kind[0]} ${pct.toFixed(0)}%`;
      });
      if (present.length <= 3 || parts.some((part) => !part.endsWith("100%"))) lines.push(`${publisher.uid}->${receiver.uid} ${parts.join(" ")}`);
    }
  }
  const decryptFailures = present.reduce((sum, p) => sum + failures(p), 0);
  const pairs = present.length * (present.length - 1);
  check(`${label}: audio + video flow between every pair (>= ${MIN_FLOW_PCT}%)`, ok, `${pairs} pairs; ${lines.slice(0, 12).join("; ") || "all 100%"}`);
  check(`${label}: decrypt + integrity failures = 0`, decryptFailures === 0, `${decryptFailures}`);
}

async function measure(label: string, present: Participant[], since: number, seconds = FLOW_SECONDS) {
  const flow = await waitForFlow(present, since);
  check(`${label}: media flowing again`, flow.ok, flow.ok ? `${(flow.ms / 1000).toFixed(1)} s after the phase started` : `not all pairs within ${FLOW_TIMEOUT_MS / 1000} s`);
  const start = now();
  await sleep(seconds * 1000);
  const end = now();
  await sleep(1500);
  assertFlow(label, present, start, end);
}

async function rejoin(p: Participant) {
  await p.join();
  await p.publish();
}

type Variant = "all" | "one" | "some" | "rapid";

const RAPID_REJOINS = 5;
const RAPID_OVERLAP_MS = 5000;

/** Proxy calls that were refused (e.g. 429 on sessions/new once a uid hits MAX_SESSIONS_PER_UID). */
function assertNoRejected(label: string, everyone: Participant[]) {
  const stats = signalingStats(everyone);
  check(`${label}: no proxy call rejected (429/403)`, stats.rejected.length === 0, stats.rejected.slice(0, 4).join(", ") || `none; max ${stats.maxTotal} calls per uid, busiest 10 s ${stats.maxBusiest10s}`);
}

async function variant(name: Variant, options: Options) {
  const room = roomClient(newMeetingId("rejoin"));
  const t0 = now();
  const byUid = new Map<string, Participant>();
  const total = name === "some" ? Math.max(3, Number(process.env.E2E_PARTICIPANTS ?? 10)) : 3;
  const leaverCount = name === "all" ? total : name === "one" ? 1 : Math.max(1, Number(process.env.E2E_REJOIN_LEAVERS ?? 3));
  const uids = Array.from({ length: total }, (_, i) => `rj-${String.fromCharCode(97 + i)}`);
  const focus = name === "some" ? { uids: new Set(uids.slice(0, leaverCount)), observer: uids[total - 1]! } : undefined;
  const onRoomMessage = messageLogger(byUid, t0, focus);
  const make = (uid: string, role: "host" | "member") =>
    new Participant({ room, uid, role, key: options.key, relay: options.relay, videoKbps: options.videoKbps, keyFrameSeconds: 2, log: info, onRoomMessage });
  // "all"/"one": A, B, C. "some": E2E_PARTICIPANTS people, the first E2E_REJOIN_LEAVERS leave and rejoin.
  const everyone = uids.map((uid, i) => make(uid, i === 0 ? "host" : "member"));
  everyone.forEach((p) => byUid.set(p.uid, p));
  console.log(`\n== rejoin variant "${name}" (meeting ${room.meetingId})`);
  try {
    info(`phase 1: ${everyone.length} people join and talk`);
    for (const p of everyone) await rejoin(p);
    await measure(`[${name}] before leave`, everyone, now());

    if (name === "rapid") {
      const [a] = everyone;
      for (let i = 1; i <= RAPID_REJOINS; i += 1) {
        info(`rapid rejoin ${i}/${RAPID_REJOINS}: ${a!.uid} opens a new socket + session; the old ones stay up ${RAPID_OVERLAP_MS / 1000} s`);
        await a!.rejoinOverlapping(RAPID_OVERLAP_MS);
        await measure(`[rapid] after overlapping rejoin ${i}`, everyone, now(), 5);
      }
      info(`${a!.uid} created ${a!.sessions.length} media sessions in total (cap MAX_SESSIONS_PER_UID = 4)`);
      assertNoRejected("[rapid]", everyone);
      const errors = everyone.flatMap((p) => p.errors);
      check("[rapid] no pull/close/send errors", errors.length === 0, errors.slice(0, 4).join(" | ") || "none");
      return;
    }

    const leavers = everyone.slice(0, leaverCount);
    info(`phase 2: ${leavers.map((p) => p.uid).join(", ")} leave one after another`);
    for (const p of leavers) {
      await p.leaveLikeBrowser();
      info(`+${((now() - t0) / 1000).toFixed(1)}s ${p.uid} left`);
      await sleep(1500);
    }
    await sleep(3000);

    info(`phase 3: ${leavers.map((p) => p.uid).join(", ")} rejoin with fresh tickets and new media sessions`);
    const rejoinedAt = now();
    for (const p of leavers) {
      await rejoin(p);
      await sleep(1000);
    }
    await measure(`[${name}] after rejoin`, everyone, rejoinedAt);
    assertNoRejected(`[${name}]`, everyone);
    const errors = everyone.flatMap((p) => p.errors);
    check(`[${name}] no pull/close/send errors`, errors.length === 0, errors.slice(0, 4).join(" | ") || "none");
  } catch (error) {
    check(`[${name}] flow completed`, false, error instanceof Error ? error.message : String(error));
  } finally {
    await Promise.all(everyone.map((p) => p.leave().catch(() => null)));
    const ended = await room.end().catch(() => 0);
    check(`[${name}] cleanup: room ended`, ended >= 200 && ended < 300, String(ended));
  }
}

/**
 * E2E_REJOIN_VARIANTS (default "all,one"): "some" = E2E_PARTICIPANTS people, E2E_REJOIN_LEAVERS of them
 * rejoin; "rapid" = A rejoins 5 times with the old socket still open for 5 s each time.
 */
export async function runRejoinScenario(options: Options) {
  const wanted = (process.env.E2E_REJOIN_VARIANTS ?? "all,one").split(",");
  for (const name of ["all", "one", "some", "rapid"] as const) if (wanted.includes(name)) await variant(name, options);
}
