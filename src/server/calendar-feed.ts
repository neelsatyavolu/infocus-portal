import { extractCalendarAnchors, extractCalendarPaAnnouncers } from "@/src/lib/calendar-show-content";
import { buildCastNameDirectory } from "@/src/lib/cast-name-directory";
import { pacificDateKey } from "@/src/lib/deadlines";
import { mainAppOrigin } from "@/src/lib/hosts";
import { buildIcsCalendar, type IcsEvent } from "@/src/lib/ics";
import { isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import {
  livestreamEvents,
  packageDeadlineEvents,
  showDayEvents,
  type FeedCycle,
  type FeedShowDay
} from "@/src/server/calendar-feed-events";

/** How far back show days and livestreams go; package deadlines cover every cycle the student is in. */
const FEED_LOOKBACK_DAYS = 60;

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string" && name.trim().length > 0) : [];
}

function roleMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
  );
}

async function loadShowDays(fromKey: string): Promise<FeedShowDay[]> {
  const [shows, entries] = await Promise.all([
    prisma.showRolesShow.findMany({ where: { date: { gte: fromKey } }, select: { date: true, anchors: true, assignments: true } }),
    prisma.masterCalendarEntry.findMany({ where: { date: { gte: fromKey } }, select: { date: true, content: true } })
  ]);
  const showByDate = new Map(shows.map((show) => [show.date, show]));
  const entryByDate = new Map(entries.map((entry) => [entry.date, entry.content]));
  const dates = [...new Set([...showByDate.keys(), ...entryByDate.keys()])].sort();
  return dates.map((date) => {
    const show = showByDate.get(date);
    const content = entryByDate.get(date) ?? "";
    // Same precedence as The Show overview: Master Calendar anchors win over stored picks.
    const calendarAnchors = content ? extractCalendarAnchors(content) : [];
    return {
      date,
      anchors: calendarAnchors.length > 0 ? calendarAnchors : stringList(show?.anchors),
      paAnnouncers: content ? extractCalendarPaAnnouncers(content) : [],
      assignments: roleMap(show?.assignments)
    };
  });
}

async function loadPackageEvents(userId: string, origin: string) {
  const rows = await prisma.packageProgressRow.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      cycleNumber: true,
      groupTopic: true,
      extension: true,
      extensionRequests: {
        where: { status: "APPROVED" },
        select: { requestedDays: true, grantedDays: true, grantedUserIds: true }
      }
    }
  });
  if (rows.length === 0) return [];
  const cycles = await prisma.packageCycle.findMany({
    where: { cycleNumber: { in: [...new Set(rows.map((row) => row.cycleNumber))] } },
    select: {
      cycleNumber: true,
      pitchingDate: true,
      proofOfContactDate: true,
      aRollBRollDate: true,
      initialCutDate: true,
      finalCutDate: true
    }
  });
  const byNumber = new Map<number, FeedCycle>(cycles.map((cycle) => [cycle.cycleNumber, cycle]));
  return packageDeadlineEvents(userId, rows, byNumber, origin);
}

async function loadLivestreamEvents(userId: string, since: Date, origin: string) {
  const [signups, attendees] = await Promise.all([
    prisma.livestreamSignupRequest.findMany({
      where: { userId, status: { in: ["PENDING", "APPROVED"] }, event: { startsAt: { gte: since }, status: { not: "CANCELLED" } } },
      select: { status: true, event: { select: { id: true, title: true, startsAt: true, arrivesAt: true, location: true } } }
    }),
    prisma.livestreamAttendee.findMany({
      where: { userId, event: { startsAt: { gte: since }, status: { not: "CANCELLED" } } },
      select: { event: { select: { id: true, title: true, startsAt: true, arrivesAt: true, location: true } } }
    })
  ]);
  const confirmed = new Set(attendees.map((row) => row.event.id));
  const byId = new Map(attendees.map((row) => [row.event.id, { ...row.event, pending: false }]));
  for (const signup of signups) {
    if (byId.has(signup.event.id)) continue;
    byId.set(signup.event.id, { ...signup.event, pending: signup.status === "PENDING" && !confirmed.has(signup.event.id) });
  }
  return livestreamEvents([...byId.values()], origin);
}

/** The .ics body for one user's feed, or null when the account no longer exists or lost access. */
export async function buildCalendarFeedForUser(userId: string, now = new Date()): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user || !(await isEmailAllowedToUsePlatform(user.email))) return null;

  const origin = mainAppOrigin();
  const fromKey = addDaysToDateKey(pacificDateKey(now), -FEED_LOOKBACK_DAYS);
  const since = new Date(now.getTime() - FEED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Two small waves keep this under the Workers limit of 6 outbound connections.
  const [packageEvents, users] = await Promise.all([
    loadPackageEvents(userId, origin),
    prisma.user.findMany({ select: { id: true, name: true, nickname: true, email: true } })
  ]);
  const [showDays, streamEvents] = await Promise.all([
    loadShowDays(fromKey),
    loadLivestreamEvents(userId, since, origin)
  ]);

  const events: IcsEvent[] = [
    ...packageEvents,
    ...showDayEvents(userId, showDays, buildCastNameDirectory(users), origin),
    ...streamEvents
  ];
  return buildIcsCalendar({ name: "InFocus", events, now });
}
