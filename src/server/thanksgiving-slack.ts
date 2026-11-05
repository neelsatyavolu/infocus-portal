import { CLASS_BOARD_TIME_ZONE } from "@/src/lib/class-board";
import { mainAppOrigin } from "@/src/lib/hosts";
import { slackBotToken, SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { HARVEST_CONTEST, type ContestResult } from "@/src/lib/thanksgiving-board";
import { inHarvestHour } from "@/src/lib/thanksgiving-harvest-hour";
import { harvestSlackFileName, harvestSlackPostKind, harvestSlackText } from "@/src/lib/thanksgiving-slack";
import { ensureSlackChannelJoined } from "@/src/server/slack-history";
import { uploadFileToSlack } from "@/src/server/slack-upload";
import { loadHarvestContest, settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { harvestHour } from "@/src/server/thanksgiving-harvest-hour";
import { renderHarvestSlackImage } from "@/src/server/thanksgiving-slack-image";
import { loadHarvestBoard } from "@/src/server/thanksgiving-scores";

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

/** The line under the five: the prize while it runs (and harvest hour when it's on), the winner after. */
export function harvestFooter(kind: "standings" | "final", result: ContestResult | null, harvestLive: boolean) {
  const days = `${HARVEST_CONTEST.prizeDays} extension days`;
  if (kind === "final") {
    if (!result || result.winners.length === 0) return "The contest is closed. Thanks for playing!";
    return `${names(result.winners)} ${result.winners.length > 1 ? "win" : "wins"} ${days} for their package group.`;
  }
  const prize = `First at ${HARVEST_CONTEST.closesLabel} wins ${days} for their whole package group.`;
  return harvestLive ? `Harvest hour is on: everything counts double. ${prize}` : prize;
}

/**
 * Posts the Thanksgiving leaderboard's top five to Slack #announcements as a picture
 * (src/lib/thanksgiving-slack.ts has the schedule). Skips when the contest is over or nobody
 * is on the board.
 */
export async function runHarvestSlackPost(now = new Date()) {
  const token = slackBotToken();
  if (!token) return { posted: false, reason: "Slack not configured" };
  const kind = harvestSlackPostKind(now);
  if (!kind) return { posted: false, reason: "contest over" };

  // The final post names the winner, so lock the contest in first (a no-op once it's settled).
  if (kind === "final") await settleHarvestContest(now);
  const [board, result] = await Promise.all([loadHarvestBoard(now), kind === "final" ? loadHarvestContest() : null]);
  const rows = board.rows.slice(0, TOP);
  if (rows.length === 0) return { posted: false, reason: "nobody on the board" };

  const image = await renderHarvestSlackImage({
    rows,
    title: kind === "final" ? "Final standings" : "Top 5",
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
