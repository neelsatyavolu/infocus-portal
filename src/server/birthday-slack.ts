import { birthdayCardNames, birthdayFirstName, birthdaySlackFileName, birthdaySlackText } from "@/src/lib/birthday-slack";
import { isBirthdayOn } from "@/src/lib/birthdays";
import { pacificDateKey } from "@/src/lib/class-board";
import { prisma } from "@/src/lib/prisma";
import { slackApi, slackBotToken, SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { renderBirthdayGif } from "@/src/server/birthday-slack-gif";
import { ensureSlackChannelJoined } from "@/src/server/slack-history";
import { uploadFileToSlack } from "@/src/server/slack-upload";

/** The person's Slack user id, or null when Slack doesn't know the email (or the bot can't look it up). */
async function slackUserIdForEmail(token: string, email: string | null) {
  if (!email) return null;
  try {
    const found = await slackApi("users.lookupByEmail", token, { email });
    const user = found.user as { id?: unknown } | undefined;
    return found.ok && typeof user?.id === "string" ? user.id : null;
  } catch (error) {
    console.error("slack birthday lookup failed", error);
    return null;
  }
}

/**
 * Wishes everyone born today (Pacific) a happy birthday in #announcements: one message that tags
 * them, with the animated InFocus card. Birthdays come from Settings → Profile and post on the real
 * date, weekends included. Runs at 00:00 Pacific (inngest-functions.ts).
 */
export async function runBirthdaySlackPost(now = new Date()) {
  const token = slackBotToken();
  if (!token) return { posted: false, reason: "Slack not configured" };
  const channel = process.env.SLACK_ANNOUNCEMENTS_CHANNEL?.trim() || SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT;

  const today = pacificDateKey(now);
  const users = await prisma.user.findMany({
    where: { birthdayMonth: { not: null }, birthdayDay: { not: null } },
    select: { name: true, nickname: true, email: true, birthdayMonth: true, birthdayDay: true },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
  const born = users.filter(
    (user) => user.birthdayMonth && user.birthdayDay && isBirthdayOn({ month: user.birthdayMonth, day: user.birthdayDay }, today)
  );
  if (born.length === 0) return { posted: false, reason: "no birthdays" };

  const people = await Promise.all(
    born.map(async (user) => ({ name: birthdayFirstName(user), slackUserId: await slackUserIdForEmail(token, user.email) }))
  );
  const names = people.map((person) => person.name);
  const bytes = await renderBirthdayGif(birthdayCardNames(names));

  await ensureSlackChannelJoined(token, channel);
  await uploadFileToSlack({
    token,
    channel,
    fileName: birthdaySlackFileName(names),
    contentType: "image/gif",
    bytes,
    text: birthdaySlackText(people)
  });
  return { posted: true, count: people.length };
}
