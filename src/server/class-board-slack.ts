import { buildClassBoardSlackText, classBoardSlackFileName } from "@/src/lib/class-board-slack";
import { CLASS_BOARD_TIME_ZONE, pacificDateKey } from "@/src/lib/class-board";
import { mainAppOrigin } from "@/src/lib/hosts";
import { slackApi, slackApiJson, slackBotToken } from "@/src/lib/slack-api";
import { loadClassBoard } from "@/src/server/class-board";
import { renderClassBoardSlackImage } from "@/src/server/class-board-slack-image";
import { ensureSlackChannelJoined } from "@/src/server/slack-history";

async function uploadToSlack(token: string, channel: string, fileName: string, bytes: Uint8Array, text: string) {
  const ready = await slackApi("files.getUploadURLExternal", token, { filename: fileName, length: String(bytes.byteLength) });
  const uploadUrl = typeof ready.upload_url === "string" ? ready.upload_url : "";
  const fileId = typeof ready.file_id === "string" ? ready.file_id : "";
  if (!ready.ok || !uploadUrl || !fileId) throw new Error(`Slack upload URL failed: ${ready.error ?? "unknown"}`);

  const uploaded = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: Buffer.from(bytes) });
  if (!uploaded.ok) throw new Error(`Slack file upload failed: ${uploaded.status}`);

  const done = await slackApiJson("files.completeUploadExternal", token, {
    files: [{ id: fileId, title: fileName }],
    channel_id: channel,
    initial_comment: text
  });
  if (!done.ok) throw new Error(`Slack file share failed: ${done.error ?? "unknown"}`);
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
  await uploadToSlack(token, channel, classBoardSlackFileName(today), image, text);
  return { posted: true, cycleNumber: board.cycleNumber };
}
