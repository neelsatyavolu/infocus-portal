import { isApnsConfigured, sendApns, type ApnsEnvironment } from "@/src/lib/apns";
import { prisma } from "@/src/lib/prisma";

/** Mac app notifications: fan an alert out to every registered Mac of the given people. */

export type NativePushPayload = { title: string; body: string; url?: string; threadId?: string };

export const NATIVE_PUSH_BODY_MAX = 180;
const GREETING = /^(hi|hello|hey)\b[^.!?]*,$/i;

function trimTo(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Notification text from an email's paragraphs: the first one that isn't a "Hi Sam," greeting. */
export function pushBodyFromParagraphs(paragraphs: string[]) {
  const first = paragraphs.find((paragraph) => paragraph.trim() && !GREETING.test(paragraph.trim()));
  return trimTo(first ?? "", NATIVE_PUSH_BODY_MAX);
}

/** Groups a Mac's notifications by the page they open (e.g. one package's group page). */
export function threadIdForUrl(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).pathname || undefined;
  } catch {
    return undefined;
  }
}

function isEnvironment(value: string): value is ApnsEnvironment {
  return value === "production" || value === "development";
}

/** Never throws: a failed push must not affect the email or action that triggered it. */
export async function sendNativePushToUserIds(userIds: string[], payload: NativePushPayload) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0 || !isApnsConfigured()) return { sent: 0, failed: 0 };

  try {
    const rows = await prisma.nativePushDevice.findMany({
      where: { userId: { in: ids } },
      select: { token: true, environment: true }
    });
    const devices = rows.flatMap((row) => (isEnvironment(row.environment) ? [{ token: row.token, environment: row.environment }] : []));
    if (devices.length === 0) return { sent: 0, failed: 0 };

    const results = await sendApns(devices, {
      title: trimTo(payload.title, 120),
      body: trimTo(payload.body, NATIVE_PUSH_BODY_MAX),
      url: payload.url,
      threadId: payload.threadId ?? threadIdForUrl(payload.url)
    });

    const deadTokens = results.filter((result) => result.dead).map((result) => result.token);
    if (deadTokens.length > 0) {
      await prisma.nativePushDevice.deleteMany({ where: { token: { in: deadTokens } } });
    }
    const failures = results.filter((result) => !result.ok && !result.dead);
    if (failures.length > 0) {
      // Reasons only: device tokens stay out of logs.
      console.error("Mac push failed", failures.map((failure) => ({ status: failure.status, reason: failure.reason })));
    }
    const sent = results.filter((result) => result.ok).length;
    return { sent, failed: results.length - sent };
  } catch (error) {
    console.error("Mac push failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: 0 };
  }
}

/** Matches email recipients to Portal users by account email or notification email (any case). */
export async function sendNativePushToEmails(emails: string[], payload: NativePushPayload) {
  const addresses = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (addresses.length === 0 || !isApnsConfigured()) return { sent: 0, failed: 0 };

  try {
    const users = await prisma.user.findMany({
      where: {
        nativePushDevices: { some: {} },
        OR: [
          { email: { in: addresses, mode: "insensitive" } },
          { notificationPreference: { notificationEmail: { in: addresses, mode: "insensitive" } } }
        ]
      },
      select: { id: true }
    });
    return await sendNativePushToUserIds(users.map((user) => user.id), payload);
  } catch (error) {
    console.error("Mac push failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: 0 };
  }
}
