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

/** One exec's picks: list key → application ids (e.g. { ep: [2 ids], ap: [3 ids] }). */
export type Picks = Record<string, string[]>;

/**
 * Saved picks cleaned against the current pool and lists: unknown ids dropped, each person in at
 * most one list (first list wins), and no list longer than its count.
 */
export function normalizePicks(value: unknown, applicationIds: string[], lists: { key: string; count: number }[]): Picks {
  const known = new Set(applicationIds);
  const used = new Set<string>();
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const result: Picks = {};
  for (const list of lists) {
    const ids = Array.isArray(input[list.key]) ? (input[list.key] as unknown[]) : [];
    result[list.key] = [];
    for (const id of ids) {
      if (typeof id !== "string" || !known.has(id) || used.has(id) || result[list.key]!.length >= list.count) continue;
      used.add(id);
      result[list.key]!.push(id);
    }
  }
  return result;
}

/** Problems that block submitting picks: each list must be full (or take everyone left). */
export function picksProblems(picks: Picks, lists: { key: string; label: string; count: number }[], poolSize: number) {
  const problems: string[] = [];
  let left = poolSize;
  for (const list of lists) {
    const needed = Math.min(list.count, Math.max(left, 0));
    const have = picks[list.key]?.length ?? 0;
    if (have < needed) problems.push(`Pick ${needed} for ${list.label} (you have ${have}).`);
    left -= have;
  }
  return problems;
}

/** How many execs picked each applicant for each list. */
export function tallyPicks(all: Picks[], applicationIds: string[], keys: string[]) {
  const result = new Map<string, Record<string, number>>();
  for (const id of applicationIds) {
    result.set(id, Object.fromEntries(keys.map((key) => [key, all.filter((picks) => picks[key]?.includes(id)).length])));
  }
  return result;
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
