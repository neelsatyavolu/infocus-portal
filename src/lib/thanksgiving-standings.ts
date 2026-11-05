import { HARVEST_CONTEST, type RankedEntry } from "@/src/lib/thanksgiving-board";

/**
 * Words and numbers around the Thanksgiving leaderboard: how far each person moved since
 * yesterday, how far the viewer is from first, and the final hour's countdown and lead.
 */

/** Places climbed since 24 hours ago (negative: fell), or "new" for someone who wasn't on the board. */
export type RankMove = number | "new";

export function rankMove(currentRank: number, pastRank: number | undefined): RankMove {
  return pastRank === undefined ? "new" : pastRank - currentRank;
}

function points(n: number) {
  return `${n} ${n === 1 ? "point" : "points"}`;
}

function nameList(names: readonly string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The viewer's distance from first ("You're 12 points behind Abby for first."), or null when they aren't ranked. */
export function viewerGapLine(rows: readonly RankedEntry[], viewerId: string): string | null {
  const mine = rows.find((row) => row.userId === viewerId);
  if (!mine) return null;
  const firsts = rows.filter((row) => row.rank === 1);
  const leader = firsts[0];
  if (mine.rank === 1) {
    const others = firsts.filter((row) => row.userId !== viewerId);
    if (others.length > 0) return `You're tied for first with ${nameList(others.map((row) => row.name))}.`;
    const next = rows.find((row) => row.rank > 1);
    return next ? `You're in first, ${points(mine.total - next.total)} ahead of ${next.name}.` : "You're in first.";
  }
  const gap = leader.total - mine.total;
  // Level on points but behind on the pardons tiebreak.
  if (gap === 0) return `You're level with ${leader.name} on points; more pardons puts them first.`;
  return `You're ${points(gap)} behind ${leader.name} for first.`;
}

/** The final hour before the close, when the top bar counts down. */
export const FINAL_HOUR_MS = 60 * 60_000;

export function inFinalHour(now: number): boolean {
  const close = HARVEST_CONTEST.closesAt.getTime();
  return now > close - FINAL_HOUR_MS && now <= close;
}

/** "59:12", or "1:00:00" for a full hour; never below 0:00. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Who's ahead, for the countdown: "Abby leads Otto by 12", "Abby and Otto are tied at 40". */
export function leadLine(rows: readonly RankedEntry[]): string {
  const firsts = rows.filter((row) => row.rank === 1);
  if (firsts.length === 0) return "Nobody's on the board yet";
  if (firsts.length > 1) return `${nameList(firsts.map((row) => row.name))} are tied at ${firsts[0].total}`;
  const [leader] = firsts;
  const next = rows.find((row) => row.rank > 1);
  if (!next) return `${leader.name} leads with ${points(leader.total)}`;
  const gap = leader.total - next.total;
  return gap === 0 ? `${leader.name} leads ${next.name} on pardons` : `${leader.name} leads ${next.name} by ${gap}`;
}
