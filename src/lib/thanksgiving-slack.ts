import { HARVEST_CONTEST, HARVEST_KINDS, HARVEST_LABELS, type HarvestCounts, type HarvestKind } from "@/src/lib/thanksgiving-board";

/**
 * The Thanksgiving leaderboard's top five, posted to Slack as a picture every three hours while
 * the contest runs (midnight, 6 AM, 9 AM, noon, 3, 6 and 9 PM Pacific; the 3 AM post is skipped
 * so nobody wakes up to it), then once more at the midnight right after the close with the
 * final standings (src/server/thanksgiving-slack.ts).
 */

/** Pacific hours with a post. Every three hours, minus 3 AM (2–6 AM is quiet). */
export const HARVEST_SLACK_HOURS = [0, 6, 9, 12, 15, 18, 21] as const;

/** How long after the close the last (final standings) post may still go out. */
const FINAL_POST_GRACE_MS = 60 * 60_000;

/** "standings" while the contest runs, "final" for the post right after it closes, else null. */
export function harvestSlackPostKind(now: Date): "standings" | "final" | null {
  const close = HARVEST_CONTEST.closesAt.getTime();
  const time = now.getTime();
  if (time <= close) return "standings";
  return time <= close + FINAL_POST_GRACE_MS ? "final" : null;
}

export function harvestSlackText(input: { kind: "standings" | "final"; boardUrl: string }) {
  const heading = input.kind === "final" ? "*Thanksgiving leaderboard: final standings*" : "*Thanksgiving leaderboard*";
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
