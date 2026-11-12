import { sendBrandedEmails } from "@/src/lib/email";
import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import { mainAppOrigin } from "@/src/lib/hosts";
import {
  REQUIRED_LIVESTREAM_HOURS,
  livestreamGradeDeadline,
  semesterForDate,
  type AcademicSemester
} from "@/src/lib/livestream";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { completedLivestreamHoursByUserIds } from "@/src/server/livestream-credit";

const PACIFIC = "America/Los_Angeles";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Nudges start two weeks before livestream grades post. */
export const LIVESTREAM_NUDGE_WINDOW_MS = 14 * DAY_MS;
const MAX_LISTED_EVENTS = 5;

/** The semester whose livestream grades post within the next two weeks, or null. */
export function livestreamNudgeSemester(now: Date): AcademicSemester | null {
  const semester = semesterForDate(now);
  const left = livestreamGradeDeadline(semester).getTime() - now.getTime();
  return left > 0 && left <= LIVESTREAM_NUDGE_WINDOW_MS ? semester : null;
}

export type LivestreamNudge = {
  userId: string;
  email: string;
  name: string;
  hoursDone: number;
  hoursNeeded: number;
};

function roundHours(hours: number) {
  return Math.round(hours * 10) / 10;
}

/**
 * Students short of the required hours: everyone on the gradable roster (no execs, adviser or
 * super admin) except appointed livestream managers, who are graded on livestreams they manage.
 */
export function selectLivestreamNudges(input: {
  users: Array<{ id: string; name: string | null; nickname: string | null; email: string | null; notificationEmail: string | null }>;
  nonGradableEmails: Set<string>;
  managerUserIds: Set<string>;
  hoursByUser: Map<string, number>;
}): LivestreamNudge[] {
  return input.users.flatMap((user) => {
    if (!user.email || input.managerUserIds.has(user.id)) return [];
    if (isExcludedFromGrading(user, input.nonGradableEmails)) return [];
    const hoursDone = roundHours(input.hoursByUser.get(user.id) ?? 0);
    if (hoursDone >= REQUIRED_LIVESTREAM_HOURS) return [];
    return [
      {
        userId: user.id,
        email: user.notificationEmail?.trim() || user.email,
        name: user.nickname?.trim() || user.name?.trim().split(/\s+/)[0] || "there",
        hoursDone,
        hoursNeeded: roundHours(REQUIRED_LIVESTREAM_HOURS - hoursDone)
      }
    ];
  });
}

/** startsAt is an ISO string after it passes through an Inngest step. */
export type OpenLivestream = { id: string; title: string; startsAt: Date | string; openSlots: number; attendeeIds: string[] };

function hoursLabel(hours: number) {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function eventLine(event: OpenLivestream) {
  const when = new Date(event.startsAt).toLocaleString("en-US", {
    timeZone: PACIFIC,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${event.title}: ${when} (${event.openSlots} open ${event.openSlots === 1 ? "slot" : "slots"})`;
}

export function livestreamNudgeMail(nudge: LivestreamNudge, deadline: Date, events: OpenLivestream[]) {
  const deadlineLabel = deadline.toLocaleDateString("en-US", {
    timeZone: PACIFIC,
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const open = events.filter((event) => !event.attendeeIds.includes(nudge.userId)).slice(0, MAX_LISTED_EVENTS);
  return {
    subject: `You need ${hoursLabel(nudge.hoursNeeded)} more of livestreams`,
    heading: "Livestream hours",
    paragraphs: [
      `Hi ${nudge.name},`,
      `You have ${hoursLabel(nudge.hoursDone)} of livestreams this semester and need ${REQUIRED_LIVESTREAM_HOURS} for full credit, so ${hoursLabel(nudge.hoursNeeded)} to go. Livestream grades post on ${deadlineLabel} with whatever hours you have by then.`,
      open.length > 0
        ? `Livestreams with open slots: ${open.map(eventLine).join("; ")}.`
        : "No upcoming livestream has an open slot right now. Check the schedule for new ones."
    ],
    ctaLabel: "Sign up for a livestream"
  };
}

async function loadOpenLivestreams(now: Date, semester: AcademicSemester): Promise<OpenLivestream[]> {
  const events = await prisma.livestreamEvent.findMany({
    where: { status: "SCHEDULED", startsAt: { gt: now, lte: semester.end } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, capacity: true, attendees: { select: { userId: true } } }
  });
  return events
    .map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      openSlots: Math.max(0, event.capacity - event.attendees.length),
      attendeeIds: event.attendees.map((attendee) => attendee.userId)
    }))
    .filter((event) => event.openSlots > 0);
}

/** Who to nudge and what's open, computed once per run. Empty outside the two-week window. */
export async function selectLivestreamHoursReminders(now = new Date()) {
  const semester = livestreamNudgeSemester(now);
  if (!semester) return { semesterLabel: null, nudges: [] as LivestreamNudge[], events: [] as OpenLivestream[] };

  const [users, nonGradableEmails, managers] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        notificationPreference: { select: { notificationEmail: true } }
      }
    }),
    loadNonGradableEmails(),
    prisma.livestreamManager.findMany({ select: { userId: true } })
  ]);
  const [hoursByUser, events] = await Promise.all([
    completedLivestreamHoursByUserIds(users.map((user) => user.id), semester),
    loadOpenLivestreams(now, semester)
  ]);
  const nudges = selectLivestreamNudges({
    users: users.map((user) => ({ ...user, notificationEmail: user.notificationPreference?.notificationEmail ?? null })),
    nonGradableEmails,
    managerUserIds: new Set(managers.map((manager) => manager.userId)),
    hoursByUser
  });
  return { semesterLabel: semester.label, nudges, events };
}

/** Sends one batch of nudges. The key makes a retried run send each email once. */
export async function sendLivestreamHoursReminders(input: {
  nudges: LivestreamNudge[];
  events: OpenLivestream[];
  semesterLabel: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const semester = semesterForDate(now);
  const deadline = livestreamGradeDeadline(semester);
  const day = pacificDateKey(now);
  let sent = 0;
  for (const nudge of input.nudges) {
    const mail = livestreamNudgeMail(nudge, deadline, input.events);
    try {
      const result = await sendBrandedEmails({
        recipients: [nudge.email],
        ...mail,
        ctaUrl: `${mainAppOrigin()}/livestreams`,
        idempotencyKey: `livestream-hours-reminder/${input.semesterLabel}/${day}/${nudge.userId}`
      });
      if (result.sent > 0) sent += 1;
    } catch (error) {
      console.error("livestream hours reminder failed", nudge.userId, error);
    }
  }
  return { sent };
}

