import { MAX_EXTENSION_DAYS } from "@/src/lib/package-extensions";

/**
 * The Thanksgiving leaderboard (/thanksgiving): what each person caught this November, counted on
 * the server (ThanksgivingScore) so the class can compare. Browsers send what they caught in small
 * batches (components/thanksgiving/harvest-tally.ts), and each catch is judged by the cheat
 * checks in src/lib/thanksgiving-guard.ts.
 */

export const HARVEST_KINDS = ["leaves", "pies", "wishbones", "giantTurkeys", "pardons"] as const;
export type HarvestKind = (typeof HARVEST_KINDS)[number];
export type HarvestCounts = Record<HarvestKind, number>;

export const HARVEST_LABELS: Record<HarvestKind, string> = {
  leaves: "Leaves",
  pies: "Pies",
  wishbones: "Wishbones",
  giantTurkeys: "Giant turkeys",
  pardons: "Pardons"
};

export const EMPTY_HARVEST: HarvestCounts = { leaves: 0, pies: 0, wishbones: 0, giantTurkeys: 0, pardons: 0 };

export function harvestTotal(counts: HarvestCounts): number {
  return HARVEST_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}

export type BoardEntry = HarvestCounts & { userId: string; name: string };
export type RankedEntry = BoardEntry & { total: number; rank: number };
/** A flagged account (src/lib/thanksgiving-guard.ts): shown under the ranks, never ranked or a winner. */
export type DisqualifiedEntry = BoardEntry & { total: number };

/** Disqualified accounts with something caught, most first. */
export function listDisqualified(entries: readonly BoardEntry[]): DisqualifiedEntry[] {
  return entries
    .map((entry) => ({ ...entry, total: harvestTotal(entry) }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/**
 * Most goodies first (every kind counts one), then more pardons, then name. People who tie share
 * a rank (1, 2, 2, 4). Nobody with nothing caught is listed.
 */
export function rankBoard(entries: readonly BoardEntry[]): RankedEntry[] {
  const sorted = entries
    .map((entry) => ({ ...entry, total: harvestTotal(entry) }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total || b.pardons - a.pardons || a.name.localeCompare(b.name));
  return sorted.map((entry) => {
    const first = sorted.findIndex((other) => other.total === entry.total && other.pardons === entry.pardons);
    return { ...entry, rank: first + 1 };
  });
}

/** The board's year: each November starts a fresh board. */
export function harvestYear(now: Date): number {
  return now.getFullYear();
}

/**
 * The 2026 contest: whoever is first on the board at 11:59 PM Pacific on November 4 wins a
 * pre-approved extension for their whole package group (src/server/thanksgiving-contest.ts).
 * Ranked by total, every kind of catch counting one. The board keeps counting afterwards.
 */
export const HARVEST_CONTEST = {
  year: 2026,
  /** 11:59 PM Pacific (PST, UTC−8) on Wednesday, November 4. */
  closesAt: new Date("2026-11-04T23:59:59.999-08:00"),
  closesLabel: "11:59 PM Wed, Nov 4",
  prizeDays: 2
} as const;

/** The contest once it has closed and been locked in. */
export type ContestResult = {
  winners: Array<{ userId: string; name: string }>;
  total: number;
  /** Winners with no package group this cycle, so no extension could be created for them. */
  ungranted: string[];
};

export function isContestOpen(now: Date): boolean {
  return now.getTime() <= HARVEST_CONTEST.closesAt.getTime();
}

/** Everyone ranked first (more than one only on an exact tie). */
export function contestWinners(rows: readonly RankedEntry[]): RankedEntry[] {
  return rows.filter((row) => row.rank === 1);
}

/**
 * The prize grant's days: a group's extension is its longest approved grant, not their sum, so the
 * prize is the longest grant that already covers the whole group plus the prize days.
 */
export function prizeGrantDays(existingWholeGroupDays: readonly number[], prizeDays: number = HARVEST_CONTEST.prizeDays): number {
  const days = Math.round((Math.max(0, ...existingWholeGroupDays) + prizeDays) * 10) / 10;
  return Math.min(days, MAX_EXTENSION_DAYS);
}
