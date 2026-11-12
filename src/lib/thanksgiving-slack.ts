import {
  HARVEST_CONTEST,
  HARVEST_KINDS,
  HARVEST_LABELS,
  harvestContestFor,
  type HarvestCounts,
  type HarvestKind
} from "@/src/lib/thanksgiving-board";

/**
 * The Thanksgiving leaderboard's top five, posted to Slack as a picture every three hours while
 * the contest runs (midnight, 6 AM, 9 AM, noon, 3, 6 and 9 PM Pacific; the 3 AM post is skipped
 * so nobody wakes up to it). Nothing goes out once the board is dark (11 PM): the last one is
 * 9 PM Thursday. At the reveal (8:00 AM Friday) it posts the winner with the final top five
 * (src/server/thanksgiving-slack.ts).
 */

/** How long after the reveal its post may still go out (a late or retried run). */
const FINAL_POST_GRACE_MS = 60 * 60_000;

/** "standings" before the board goes dark, "final" for the reveal post, else null (also in a year with no contest). */
export function harvestSlackPostKind(now: Date): "standings" | "final" | null {
  if (!harvestContestFor(now)) return null;
  const time = now.getTime();
  if (time < HARVEST_CONTEST.hiddenFrom.getTime()) return "standings";
  const reveal = HARVEST_CONTEST.revealAt.getTime();
  return time >= reveal && time <= reveal + FINAL_POST_GRACE_MS ? "final" : null;
}

export function harvestSlackText(input: { kind: "standings" | "final"; boardUrl: string }) {
  const heading = input.kind === "final" ? "*Thanksgiving leaderboard: the winner*" : "*Thanksgiving leaderboard*";
  return [heading, `<${input.boardUrl}|See the whole board>`].join("\n");
}

export function harvestSlackFileName(now: Date) {
  return `thanksgiving-leaderboard-${now.toISOString().slice(0, 13).replace("T", "-")}.png`;
}

const ONE: Record<HarvestKind, string> = {
  leaves: "leaf",
  goldenLeaves: "golden leaf",
  pies: "pie",
  wishbones: "wishbone",
  giantTurkeys: "giant turkey",
  pardons: "pardon"
};

/** "212 leaves · 1 golden leaf · 18 pies": the kinds a person has caught, in board order. */
export function harvestBreakdown(counts: HarvestCounts): string {
  return HARVEST_KINDS.filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${counts[kind] === 1 ? ONE[kind] : HARVEST_LABELS[kind].toLowerCase()}`)
    .join(" · ");
}
