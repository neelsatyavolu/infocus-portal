import { MAX_EXTENSION_DAYS } from "@/src/lib/package-extensions";

/**
 * The Thanksgiving leaderboard (/thanksgiving): what each person caught this November, counted on
 * the server (ThanksgivingScore) so the class can compare. Browsers send what they caught in small
 * batches (components/thanksgiving/harvest-tally.ts), and each catch is judged by the cheat
 * checks in src/lib/thanksgiving-guard.ts.
 */

export const HARVEST_KINDS = ["leaves", "goldenLeaves", "pies", "wishbones", "giantTurkeys", "pardons"] as const;
export type HarvestKind = (typeof HARVEST_KINDS)[number];
export type HarvestCounts = Record<HarvestKind, number>;

export const HARVEST_LABELS: Record<HarvestKind, string> = {
  leaves: "Leaves",
  goldenLeaves: "Golden leaves",
  pies: "Pies",
  wishbones: "Wishbones",
  giantTurkeys: "Giant turkeys",
  pardons: "Pardons"
};

export const EMPTY_HARVEST: HarvestCounts = { leaves: 0, goldenLeaves: 0, pies: 0, wishbones: 0, giantTurkeys: 0, pardons: 0 };

/** Points per catch: a golden leaf (rare, and quick to fall) is worth five, everything else one. */
export const KIND_POINTS: Record<HarvestKind, number> = {
  leaves: 1,
  goldenLeaves: 5,
  pies: 1,
  wishbones: 1,
  giantTurkeys: 1,
  pardons: 1
};

/**
 * Points: each catch at its kind's worth, plus `bonus` (the extra points from catches made during
 * harvest hour, which count double; src/lib/thanksgiving-harvest-hour.ts).
 */
export function harvestTotal(counts: HarvestCounts & { bonus: number }): number {
  return HARVEST_KINDS.reduce((sum, kind) => sum + counts[kind] * KIND_POINTS[kind], counts.bonus);
}

/** `bonus`: harvest hour's extra points (each catch then counts twice). */
export type BoardEntry = HarvestCounts & { bonus: number; userId: string; name: string };
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
 * Most points first (harvestTotal), then more pardons, then name. People who tie share
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
 * The 2026 contest: whoever is first on the board at 11:59 PM Pacific on November 5 wins a
 * pre-approved extension for a Cycle 2 package group (src/server/thanksgiving-contest.ts): their
 * own, or, if theirs already turned in its Final Cut, a group still working that they pick
 * (src/server/thanksgiving-prize.ts). Ranked by points (harvestTotal). The last hour is blind:
 * everyone but the super admin sees only their own points until the winner is revealed at 8:00 AM
 * Friday. The board keeps counting afterwards.
 */
export const HARVEST_CONTEST = {
  year: 2026,
  /** 11:59 PM Pacific (PST, UTC−8) on Thursday, November 5. */
  closesAt: new Date("2026-11-05T23:59:59.999-08:00"),
  closesLabel: "11:59 PM Thu, Nov 5",
  /** From here until the reveal, everyone but the super admin sees only their own points. */
  hiddenFrom: new Date("2026-11-05T23:00:00-08:00"),
  hiddenLabel: "11:00 PM",
  /** 8:00 AM Pacific on Friday, November 6: the winner is announced on the Portal and in Slack. */
  revealAt: new Date("2026-11-06T08:00:00-08:00"),
  revealLabel: "8:00 AM Fri, Nov 6",
  /** The prize goes to a group in this cycle. */
  prizeCycle: 2,
  prizeDays: 2
} as const;

/**
 * The contest configured for `now`'s year, or null. Only 2026 has one: in any other year the
 * leaves still fall and count, but nothing contest-specific (leaderboard page, cheat review,
 * prize, Slack posts) runs.
 */
export function harvestContestFor(now: Date): typeof HARVEST_CONTEST | null {
  return harvestYear(now) === HARVEST_CONTEST.year ? HARVEST_CONTEST : null;
}

/**
 * The leaderboard (its sidebar link, /thanksgiving, the Class Board top five, the popup and the
 * countdown strip) shows only in a contest year, until the winner is revealed.
 */
export function isLeaderboardOpen(now: Date): boolean {
  const contest = harvestContestFor(now);
  return contest !== null && now.getTime() < contest.revealAt.getTime();
}

/**
 * Where a winner's prize went: their own Cycle 2 group, a group they gave it to, still to be
 * picked (their group already turned in its Final Cut), or nowhere (not on a Cycle 2 group: an
 * exec adds it by hand).
 */
export type PrizeStatus =
  | { kind: "own-group" }
  | { kind: "gifted"; to: string }
  | { kind: "choosing" }
  | { kind: "no-group" };

/** The contest once the winner has been revealed. */
export type ContestResult = {
  winners: Array<{ userId: string; name: string; prize: PrizeStatus }>;
  total: number;
};

/**
 * open: the board is public. blind: the last hour, people see only their own points. closed:
 * locked in, waiting for the reveal (still blind). revealed: the winner is out, the board public again.
 */
export type ContestPhase = "open" | "blind" | "closed" | "revealed";

export function contestPhase(now: Date): ContestPhase {
  const time = now.getTime();
  if (time >= HARVEST_CONTEST.revealAt.getTime()) return "revealed";
  if (time > HARVEST_CONTEST.closesAt.getTime()) return "closed";
  if (time >= HARVEST_CONTEST.hiddenFrom.getTime()) return "blind";
  return "open";
}

/** The viewer's own points, ranked or disqualified (0 when they haven't caught anything). */
export function viewerPoints(
  board: { rows: readonly { userId: string; total: number }[]; disqualified: readonly { userId: string; total: number }[] },
  viewerId: string
): number {
  return [...board.rows, ...board.disqualified].find((entry) => entry.userId === viewerId)?.total ?? 0;
}

/** The standings are dark (the last hour, then until the reveal): only the super admin sees them. */
export function isBoardHidden(now: Date): boolean {
  const phase = contestPhase(now);
  return phase === "blind" || phase === "closed";
}

/** Whether this role sees the standings now: everyone while the board is public, only the super admin while it's dark. */
export function seesBoard(now: Date, role: string | null | undefined): boolean {
  return !isBoardHidden(now) || role === "SUPER_ADMIN";
}

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
