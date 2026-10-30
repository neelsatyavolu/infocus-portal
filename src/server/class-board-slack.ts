import { buildClassBoardSlackText, classBoardSlackFileName } from "@/src/lib/class-board-slack";
import { CLASS_BOARD_TIME_ZONE, pacificDateKey } from "@/src/lib/class-board";
import { mainAppOrigin } from "@/src/lib/hosts";
import { slackBotToken } from "@/src/lib/slack-api";
import { loadClassBoard } from "@/src/server/class-board";
import { renderClassBoardSlackImage } from "@/src/server/class-board-slack-image";
import { ensureSlackChannelJoined } from "@/src/server/slack-history";
import { uploadFileToSlack } from "@/src/server/slack-upload";

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

/**
 * Posts the cycle's progress to Slack: a heading, the board link, and a picture of the whole race.
 * Runs Monday, Wednesday and Friday evenings (inngest-functions.ts).
 */
export async function runClassBoardSlackPost(now = new Date()) {
  const token = slackBotToken();
  const channel = process.env.SLACK_CLASS_BOARD_CHANNEL?.trim() ?? "";
  if (!token || !channel) return { posted: false, reason: "Slack not configured" };

  const board = await loadClassBoard(null, now);
  const today = pacificDateKey(now);
  if (board.days.find((day) => day.date === today)?.kind === "HOLIDAY") return { posted: false, reason: "no school" };
  if (board.lanes.length === 0) return { posted: false, reason: "no packages" };

  const image = await renderClassBoardSlackImage({ cycleNumber: board.cycleNumber, gates: board.gates, lanes: board.lanes, stamp: imageStamp(now) });
  const text = buildClassBoardSlackText({
    cycleNumber: board.cycleNumber,
    boardUrl: `${mainAppOrigin().replace(/\/+$/, "")}/class-board`
  });

  await ensureSlackChannelJoined(token, channel);
  await uploadFileToSlack({ token, channel, fileName: classBoardSlackFileName(today), contentType: "image/png", bytes: image, text });
  return { posted: true, cycleNumber: board.cycleNumber };
}
