/**
 * E2E_SCENARIO=staggered: one person joins every E2E_STAGGER_MS (default 3 s).
 * - newcomer: join click (ticket) -> first decrypted video frame from each member already there;
 * - existing members: newcomer's tracks seen in a room message -> first decrypted frame from them
 *   (the pull + renegotiation on a busy peer connection).
 */
import { check, percentile } from "./common";
import type { Participant } from "./participant";

const LIMIT_MS = 3000;
const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(0) : "n/a");

function firstVideo(receiver: Participant, publisher: Participant) {
  const records = receiver.inbound.get(publisher.uid)?.video ?? [];
  return records.length ? Math.min(...records.map((r) => r.arrival)) : NaN;
}

export function reportStaggered(participants: Participant[]) {
  const ordered = [...participants].sort((a, b) => a.times.ticketAt - b.times.ticketAt);
  const newcomer: number[] = [];
  const existing: number[] = [];
  const perJoiner: string[] = [];
  ordered.forEach((joiner, index) => {
    const before = ordered.slice(0, index);
    if (!before.length) return;
    const seeOthers = before.map((member) => firstVideo(joiner, member) - joiner.times.ticketAt);
    const seenBy = before.map((member) => firstVideo(member, joiner) - (member.inbound.get(joiner.uid)?.seenAt ?? NaN));
    newcomer.push(...seeOthers);
    existing.push(...seenBy);
    perJoiner.push(`#${index + 1} ${fmt(Math.max(...seeOthers))}/${fmt(Math.max(...seenBy))}`);
  });
  const worstNew = Math.max(...newcomer);
  const worstExisting = Math.max(...existing);
  check(
    `staggered: newcomer click -> first video from every member < ${LIMIT_MS} ms (worst)`,
    worstNew < LIMIT_MS,
    `p50 ${fmt(percentile(newcomer, 50))}, p95 ${fmt(percentile(newcomer, 95))}, worst ${fmt(worstNew)} ms over ${newcomer.length} pairs`
  );
  check(
    `staggered: members see newcomer's video < ${LIMIT_MS} ms after its tracks arrive (worst)`,
    worstExisting < LIMIT_MS,
    `p50 ${fmt(percentile(existing, 50))}, p95 ${fmt(percentile(existing, 95))}, worst ${fmt(worstExisting)} ms; per joiner worst newcomer/members ms: ${perJoiner.join(", ")}`
  );
}
