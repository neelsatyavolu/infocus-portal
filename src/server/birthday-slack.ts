import { birthdayFirstName, birthdaySlackFileName, birthdaySlackText, type BirthdaySlackPerson } from "@/src/lib/birthday-slack";
import { isBirthdayOn } from "@/src/lib/birthdays";
import { pacificDateKey } from "@/src/lib/class-board";
import { prisma } from "@/src/lib/prisma";
import { slackApi, slackBotToken, SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { ensureSlackChannelJoined } from "@/src/server/slack-history";
import { uploadFileToSlack } from "@/src/server/slack-upload";

/*
 * The midnight birthday post in #announcements. It runs as three Inngest steps (inngest-functions.ts):
 * find today's birthdays, render the GIF (src/server/birthday-slack-gif.tsx), then post it. Rendering
 * is ~20 s of pure CPU, and a deployed Worker's clock only moves on I/O, so a Slack call with a
 * 5 s timeout made right after it times out at once. Each step is its own request with a fresh clock.
 */

function announcementsChannel() {
  return process.env.SLACK_ANNOUNCEMENTS_CHANNEL?.trim() || SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT;
}

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
 * Everyone born today (Pacific), from Settings → Profile. Birthdays post on the real date, weekends
 * included, not the class day the Master Calendar moves them to.
 */
export async function findTodaysBirthdays(now = new Date()): Promise<{ people: BirthdaySlackPerson[]; reason?: string }> {
  const token = slackBotToken();
  if (!token) return { people: [], reason: "Slack not configured" };

  const today = pacificDateKey(now);
  const users = await prisma.user.findMany({
    where: { birthdayMonth: { not: null }, birthdayDay: { not: null } },
    select: { name: true, nickname: true, email: true, birthdayMonth: true, birthdayDay: true },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
  const born = users.filter(
    (user) => user.birthdayMonth && user.birthdayDay && isBirthdayOn({ month: user.birthdayMonth, day: user.birthdayDay }, today)
  );
  if (born.length === 0) return { people: [], reason: "no birthdays" };

  const people = await Promise.all(
    born.map(async (user) => ({ name: birthdayFirstName(user), slackUserId: await slackUserIdForEmail(token, user.email) }))
  );
  return { people };
}

/** One message in #announcements that tags them, with the animated InFocus card (base64 GIF). */
export async function postBirthdayGif(people: BirthdaySlackPerson[], gifBase64: string) {
  const token = slackBotToken();
  const channel = announcementsChannel();
  await ensureSlackChannelJoined(token, channel);
  await uploadFileToSlack({
    token,
    channel,
    fileName: birthdaySlackFileName(people.map((person) => person.name)),
    contentType: "image/gif",
    bytes: new Uint8Array(Buffer.from(gifBase64, "base64")),
    text: birthdaySlackText(people)
  });
  return { posted: true, count: people.length };
}
