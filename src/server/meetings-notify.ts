import { sendNativePushToUserIds } from "@/src/lib/native-push";
import { prisma } from "@/src/lib/prisma";
import { execUserIds, producerUserIds } from "@/src/server/meetings-people";
import type { MeetingAccessFields } from "@/src/server/meetings-rules";
import { sendPushToUserIds } from "@/src/server/push-notify";

/**
 * Meeting pushes: "starting" to the people who may join (invitees, else all producers) and
 * "waiting to join" to the meeting's hosts. INVITE_ONLY meetings never push anyone outside their list.
 */

const START_LOOKBACK_MS = 5 * 60 * 1000;
const START_LOOKAHEAD_MS = 60 * 1000;
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
  if (meeting.access === "INVITE_ONLY") {
    return [...(meeting.createdById ? [meeting.createdById] : []), ...meeting.inviteeUserIds];
  }
  return meeting.inviteeUserIds.length > 0 ? meeting.inviteeUserIds : producerUserIds();
}

/** Host ids, matching isMeetingHost(). */
export async function meetingHostIds(meeting: MeetingAccessFields) {
  const execs = await execUserIds();
  const hosts =
    meeting.access === "INVITE_ONLY" ? execs.filter((id) => meeting.inviteeUserIds.includes(id)) : execs;
  return [...new Set([...hosts, ...(meeting.createdById ? [meeting.createdById] : [])])];
}

/**
 * Cron (every 5 minutes): push meetings that start now. Each meeting is claimed by setting
 * `startNotifiedAt` first, so overlapping runs never push twice.
 */
export async function runMeetingStartPushes(now = new Date()) {
  const due = await prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      startNotifiedAt: null,
      startsAt: { gte: new Date(now.getTime() - START_LOOKBACK_MS), lte: new Date(now.getTime() + START_LOOKAHEAD_MS) }
    },
    select: { id: true, title: true, access: true, createdById: true, inviteeUserIds: true }
  });

  let pushed = 0;
  for (const meeting of due) {
    const claim = await prisma.meeting.updateMany({
      where: { id: meeting.id, startNotifiedAt: null },
      data: { startNotifiedAt: now }
    });
    if (claim.count === 0) continue;
    await pushToUsers(await meetingStartRecipients(meeting), {
      title: `${meeting.title} is starting`,
      body: "Tap to join the call.",
      url: `/meet/${meeting.id}`
    });
    pushed += 1;
  }
  return { due: due.length, pushed };
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
    { title: meeting.title, body: `${knocker.name || "Someone"} is waiting to join ${meeting.title}`, url: `/meet/${meeting.id}` }
  );
  return true;
}
