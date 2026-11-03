/**
 * The Thanksgiving leaderboard (/thanksgiving): what each person caught this November, counted on
 * the server (ThanksgivingScore) so the class can compare. Browsers send what they caught in small
 * batches (components/thanksgiving/harvest-tally.ts); each batch is clamped here.
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

/** Most of one kind a single batch may add (a batch covers a few seconds of play). */
export const MAX_BATCH = 100;
/** Most a browser's saved leaf or pie count may carry over the first time it joins the board. */
export const MAX_CARRY_OVER = 2_000;

function wholeNumber(value: unknown, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : 0;
}

/** Turns a posted batch into safe whole numbers, each between 0 and `max`. */
export function clampHarvest(input: Partial<Record<HarvestKind, unknown>> | null | undefined, max = MAX_BATCH): HarvestCounts {
  return Object.fromEntries(HARVEST_KINDS.map((kind) => [kind, wholeNumber(input?.[kind], max)])) as HarvestCounts;
}

export function harvestTotal(counts: HarvestCounts): number {
  return HARVEST_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}

export function isEmptyHarvest(counts: HarvestCounts): boolean {
  return harvestTotal(counts) === 0;
}

export type BoardEntry = HarvestCounts & { userId: string; name: string };
export type RankedEntry = BoardEntry & { total: number; rank: number };

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
