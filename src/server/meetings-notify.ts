import { mainAppOrigin } from "@/src/lib/hosts";
import { sendNativePushToUserIds } from "@/src/lib/native-push";
import { prisma } from "@/src/lib/prisma";
import { execUserIds, producerUserIds } from "@/src/server/meetings-people";
import type { MeetingAccessFields } from "@/src/server/meetings-rules";
import { sendPushToUserIds } from "@/src/server/push-notify";

/**
 * Meeting pushes: 15- and 5-minute reminders to the people who may join (invitees, else all producers) and
 * "waiting to join" to the meeting's hosts. INVITE_ONLY meetings never push anyone outside their list;
 * EXECS_ONLY meetings push execs only.
 */

export const KNOCK_PUSH_THROTTLE_MS = 2 * 60 * 1000;

/** Never throws: pushes are best effort. */
async function pushToUsers(userIds: string[], payload: { title: string; body: string; url: string }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await Promise.all([sendPushToUserIds(ids, payload, "browser"), sendNativePushToUserIds(ids, payload)]);
  } catch (error) {
    console.error("Meeting push failed", error instanceof Error ? error.message : error);
  }
}

/** Start-push recipients. */
export async function meetingStartRecipients(meeting: MeetingAccessFields) {
  if (meeting.access === "EXECS_ONLY") return execUserIds();
  if (meeting.access === "INVITE_ONLY") {
    return [...(meeting.createdById ? [meeting.createdById] : []), ...meeting.inviteeUserIds];
  }
  return meeting.inviteeUserIds.length > 0 ? meeting.inviteeUserIds : producerUserIds();
}

/** Host ids, matching isMeetingHost(). */
export async function meetingHostIds(meeting: MeetingAccessFields) {
  const execs = await execUserIds();
  if (meeting.access === "EXECS_ONLY") return execs;
  const hosts =
    meeting.access === "INVITE_ONLY" ? execs.filter((id) => meeting.inviteeUserIds.includes(id)) : execs;
  return [...new Set([...hosts, ...(meeting.createdById ? [meeting.createdById] : [])])];
}

export const MEETING_REMINDERS = [
  { minutes: 15, field: "reminder15SentAt", suffix: "starts in 15 minutes", body: "Tap to open the meeting." },
  { minutes: 5, field: "reminder5SentAt", suffix: "starts in 5 minutes", body: "Join now." }
] as const;
/** A reminder fires while startsAt is between (lead − 2 min, lead] away, so a late-created or moved meeting skips it. */
const REMINDER_TOLERANCE_MS = 2 * 60 * 1000;

/** Absolute link: the iPhone and Mac apps only open notification URLs on the Portal's own origin. */
export function meetingPushUrl(meetingId: string) {
  return `${mainAppOrigin().replace(/\/+$/, "")}/meet/${meetingId}`;
}

/**
 * Cron (every minute): 15- and 5-minute reminders. Each is claimed with its own stamp before
 * pushing, so overlapping runs never send twice. Meetings created after a reminder's time are skipped.
 */
export async function runMeetingReminders(now = new Date()) {
  let pushed = 0;
  for (const reminder of MEETING_REMINDERS) {
    const leadMs = reminder.minutes * 60 * 1000;
    const due = await prisma.meeting.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE"] },
        [reminder.field]: null,
        startsAt: { gt: new Date(now.getTime() + leadMs - REMINDER_TOLERANCE_MS), lte: new Date(now.getTime() + leadMs) }
      },
      select: { id: true, title: true, startsAt: true, createdAt: true, access: true, createdById: true, inviteeUserIds: true }
    });
    for (const meeting of due) {
      if (meeting.createdAt.getTime() > meeting.startsAt.getTime() - leadMs) continue;
      const claim = await prisma.meeting.updateMany({
        where: { id: meeting.id, [reminder.field]: null },
        data: { [reminder.field]: now }
      });
      if (claim.count === 0) continue;
      await pushToUsers(await meetingStartRecipients(meeting), {
        title: `${meeting.title} ${reminder.suffix}`,
        body: reminder.body,
        url: meetingPushUrl(meeting.id)
      });
      pushed += 1;
    }
  }
  return { pushed };
}

const lastKnockPush = new Map<string, number>();

/** The meeting's hosts hear that someone is waiting; once per person per meeting per 2 minutes. */
export async function notifyMeetingKnock(
  meeting: MeetingAccessFields & { id: string; title: string },
  knocker: { uid: string; name: string },
  now = Date.now()
) {
  const throttleKey = `${meeting.id}:${knocker.uid}`;
  const last = lastKnockPush.get(throttleKey);
  if (last !== undefined && now - last < KNOCK_PUSH_THROTTLE_MS) return false;
  lastKnockPush.set(throttleKey, now);
  for (const [key, at] of lastKnockPush) {
    if (now - at >= KNOCK_PUSH_THROTTLE_MS) lastKnockPush.delete(key);
  }

  const hosts = await meetingHostIds(meeting);
  await pushToUsers(
    hosts.filter((id) => id !== knocker.uid),
    { title: meeting.title, body: `${knocker.name || "Someone"} is waiting to join ${meeting.title}`, url: meetingPushUrl(meeting.id) }
  );
  return true;
}
