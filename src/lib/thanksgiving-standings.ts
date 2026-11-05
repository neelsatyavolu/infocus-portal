import { HARVEST_CONTEST, type RankedEntry } from "@/src/lib/thanksgiving-board";

/**
 * Words and numbers around the Thanksgiving leaderboard: how far each person moved since
 * yesterday, how far the viewer is from first, and the final hour's countdown.
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

/** The final hour before the close (the dark hour), when the top bar counts down. */
export function inFinalHour(now: number): boolean {
  return now >= HARVEST_CONTEST.hiddenFrom.getTime() && now <= HARVEST_CONTEST.closesAt.getTime();
}

/** "59:12", or "1:00:00" for a full hour; never below 0:00. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
