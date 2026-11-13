/**
 * Decision desk math: majority votes, average ranks, the AI read's relative standings, and the
 * application window. Pure, so tests and both sides of the wire share it.
 */

export type VoteTally = { counts: Record<string, number>; winner: string | null; needed: number; cast: number };

/** An option wins when more than half of all voters (not just those who voted) picked it. */
export function tallyVotes(optionKeys: string[], voterCount: number): VoteTally {
  const counts: Record<string, number> = {};
  for (const key of optionKeys) counts[key] = (counts[key] ?? 0) + 1;
  const needed = Math.floor(Math.max(voterCount, 1) / 2) + 1;
  const winner = Object.entries(counts).find(([, count]) => count >= needed)?.[0] ?? null;
  return { counts, winner, needed, cast: optionKeys.length };
}

/** Each applicant's rank (1 = best) in every submitted order, and the average. Unranked ids are skipped. */
export function aggregateRanks(orders: string[][], applicationIds: string[]) {
  const result = new Map<string, { ranks: number[]; average: number | null }>();
  for (const id of applicationIds) {
    const ranks = orders.map((order) => order.indexOf(id)).filter((index) => index >= 0).map((index) => index + 1);
    const average = ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null;
    result.set(id, { ranks, average });
  }
  return result;
}

/** A saved order cleaned against the current pool: unknown ids dropped, missing ones appended. */
export function normalizeOrder(order: unknown, applicationIds: string[]) {
  const known = new Set(applicationIds);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (typeof id === "string" && known.has(id) && !seen.has(id)) {
      seen.add(id);
      kept.push(id);
    }
  }
  return [...kept, ...applicationIds.filter((id) => !seen.has(id))];
}

export type AiScores = Record<string, { score: number; reason: string }>;
export type AiStanding = { total: number; place: number; of: number; criteria: Record<string, { score: number; place: number }> };

/** Places ("3rd of 9") from AI scores, overall and per criterion. Ties share a place. */
export function relativeStandings(reads: { id: string; scores: AiScores }[], criteriaKeys: string[]) {
  const totals = reads.map((read) => ({
    id: read.id,
    total: criteriaKeys.reduce((sum, key) => sum + (read.scores[key]?.score ?? 0), 0)
  }));
  const placeOf = (value: number, values: number[]) => 1 + values.filter((other) => other > value).length;
  const allTotals = totals.map((entry) => entry.total);
  const standings = new Map<string, AiStanding>();
  for (const read of reads) {
    const total = totals.find((entry) => entry.id === read.id)?.total ?? 0;
    const criteria: AiStanding["criteria"] = {};
    for (const key of criteriaKeys) {
      const score = read.scores[key]?.score ?? 0;
      criteria[key] = { score, place: placeOf(score, reads.map((other) => other.scores[key]?.score ?? 0)) };
    }
    standings.set(read.id, { total, place: placeOf(total, allTotals), of: reads.length, criteria });
  }
  return standings;
}

export function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export type WindowInput = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  opensAt: Date | null;
  dueAt: Date;
  extensionUntil?: Date | null;
};

/** Whether this applicant may edit and submit right now (server rule; the client mirrors it). */
export function windowState(round: WindowInput, now = new Date()) {
  const opened = round.status !== "DRAFT" && (!round.opensAt || round.opensAt <= now);
  const extended = Boolean(round.extensionUntil && round.extensionUntil > round.dueAt);
  const deadline = extended && round.extensionUntil ? round.extensionUntil : round.dueAt;
  const beforeDeadline = now <= deadline;
  // A personal extension still works after the round is closed to everyone else.
  const statusAllows = round.status === "PUBLISHED" || (round.status === "CLOSED" && extended);
  return { opened, deadline, beforeDeadline, canEdit: opened && statusAllows && beforeDeadline };
}

export function isReleased(releaseAt: Date | null, now = new Date()) {
  return Boolean(releaseAt && releaseAt <= now);
}
