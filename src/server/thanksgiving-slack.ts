import { CLASS_BOARD_TIME_ZONE } from "@/src/lib/class-board";
import { mainAppOrigin } from "@/src/lib/hosts";
import { slackBotToken, SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { HARVEST_CONTEST, type ContestResult, type PrizeStatus } from "@/src/lib/thanksgiving-board";
import { inHarvestHour } from "@/src/lib/thanksgiving-harvest-hour";
import { harvestSlackFileName, harvestSlackPostKind, harvestSlackText } from "@/src/lib/thanksgiving-slack";
import { ensureSlackChannelJoined } from "@/src/server/slack-history";
import { uploadFileToSlack } from "@/src/server/slack-upload";
import { loadHarvestContest, settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { harvestHour } from "@/src/server/thanksgiving-harvest-hour";
import { renderHarvestSlackImage } from "@/src/server/thanksgiving-slack-image";
import { loadBoardAt, loadHarvestBoard } from "@/src/server/thanksgiving-scores";

const TOP = 5;

function announcementsChannel() {
  return process.env.SLACK_ANNOUNCEMENTS_CHANNEL?.trim() || SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT;
}

function imageStamp(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLASS_BOARD_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("weekday")} ${part("month")} ${part("day")} · ${part("hour")}:${part("minute")} ${part("dayPeriod")}`.toUpperCase();
}

function names(winners: ContestResult["winners"]) {
  return winners.map((winner) => winner.name).join(" and ");
}

const DAYS = `${HARVEST_CONTEST.prizeDays} extension days`;

function prizeLine(name: string, prize: PrizeStatus) {
  switch (prize.kind) {
    case "own-group":
      return `${name} wins ${DAYS} for their Cycle 2 group.`;
    case "choosing":
      return `${name} wins ${DAYS} to give to a Cycle 2 group still working.`;
    case "gifted":
      return `${name} gave ${DAYS} to ${prize.to}.`;
    case "no-group":
      return `${name} wins ${DAYS}.`;
  }
}

/** The picture's title: who won, or the standings while it runs. */
export function harvestTitle(kind: "standings" | "final", result: ContestResult | null) {
  if (kind === "standings") return "Top 5";
  if (!result || result.winners.length === 0) return "Final standings";
  return `${names(result.winners)} ${result.winners.length > 1 ? "win" : "wins"}!`;
}

/** The line under the five: the prize while it runs (and harvest hour when it's on), where the prize went after. */
export function harvestFooter(kind: "standings" | "final", result: ContestResult | null, harvestLive: boolean) {
  if (kind === "final") {
    if (!result || result.winners.length === 0) return "The contest is closed. Thanks for playing!";
    return result.winners.map((winner) => prizeLine(winner.name, winner.prize)).join(" ");
  }
  const prize = `First at ${HARVEST_CONTEST.closesLabel} wins ${DAYS} for a Cycle 2 group.`;
  return harvestLive ? `Harvest hour is on: everything counts double. ${prize}` : prize;
}

/**
 * Posts the Thanksgiving leaderboard's top five to Slack #announcements as a picture
 * (src/lib/thanksgiving-slack.ts has the schedule), or at the reveal the winner with the final
 * top five. Skips while the board is dark, after the reveal post, or with nobody on the board.
 */
export async function runHarvestSlackPost(now = new Date()) {
  const token = slackBotToken();
  if (!token) return { posted: false, reason: "Slack not configured" };
  const kind = harvestSlackPostKind(now);
  if (!kind) return { posted: false, reason: "no post now" };

  // The reveal post names the winner, so reveal it first (a no-op once it's done).
  if (kind === "final") await settleHarvestContest(now);
  const [board, result] = await Promise.all([loadHarvestBoard(now), kind === "final" ? loadHarvestContest() : null]);
  // The reveal shows the board as it stood at the close, not what was caught overnight.
  const ranked = kind === "final" ? await loadBoardAt(board.rows, HARVEST_CONTEST.closesAt) : board.rows;
  const rows = ranked.slice(0, TOP);
  if (rows.length === 0) return { posted: false, reason: "nobody on the board" };

  const image = await renderHarvestSlackImage({
    rows,
    title: harvestTitle(kind, result),
    stamp: imageStamp(now),
    footer: harvestFooter(kind, result, inHarvestHour(harvestHour(), now))
  });
  const channel = announcementsChannel();
  await ensureSlackChannelJoined(token, channel);
  await uploadFileToSlack({
    token,
    channel,
    fileName: harvestSlackFileName(now),
    contentType: "image/png",
    bytes: image,
    text: harvestSlackText({ kind, boardUrl: `${mainAppOrigin().replace(/\/+$/, "")}/thanksgiving` })
  });
  return { posted: true, kind, count: rows.length };
}
