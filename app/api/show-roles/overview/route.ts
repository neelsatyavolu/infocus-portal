import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { isCustomQueuePackage } from "@/src/lib/publishing-queue";
import { extractCalendarAnchors, extractCalendarPaAnnouncers } from "@/src/lib/calendar-show-content";
import {
  DATE_KEY_PATTERN,
  formatShowDateLabel,
  nextUpcomingShowDate,
  todayDateKey
} from "@/src/lib/show-assignment";
import { resolveScheduleDay } from "@/src/lib/school-schedule";
import { userDisplayName } from "@/src/lib/user-display";
import { listUpcomingShows, loadScheduleOverrides } from "@/src/server/show-schedule";
import {
  collectMonthAnchorNames,
  listShowRolesPool,
  suggestAnchorsForDate,
  suggestPaForDate
} from "@/src/server/show-cast";
import { resolveShowManagers } from "@/src/server/show-manager";
import { ROLES } from "@/src/show-roles/lib/constants";
import { anchorModeForDate, weekOfMonth } from "@/src/show-roles/lib/anchors";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const requested = new URL(request.url).searchParams.get("date");
    if (requested && !DATE_KEY_PATTERN.test(requested)) {
      return fail("A valid date is required.", 400);
    }

    const upcoming = await listUpcomingShows(8);
    const today = todayDateKey();
    const endKey = upcoming[upcoming.length - 1] ?? today;
    const overrides = await loadScheduleOverrides(today, endKey);
    const dateKey = requested && DATE_KEY_PATTERN.test(requested)
      ? requested
      : nextUpcomingShowDate(today, overrides) ?? upcoming[0] ?? today;
    const schedule = resolveScheduleDay(dateKey, overrides);
    const date = new Date(`${dateKey}T12:00:00`);

    const [entry, show, queued, suggestion, paSuggestion, monthAnchors, castPool, teleprompterDoc, showManager] = await Promise.all([
      prisma.masterCalendarEntry.findUnique({ where: { date: dateKey } }),
      prisma.showRolesShow.findUnique({ where: { date: dateKey } }),
      prisma.packageProgressRow.findMany({
        where: { queuedForAirAt: { not: null } },
        include: {
          members: { include: { user: { select: { name: true, nickname: true, email: true } } } }
        },
        orderBy: [{ queuedForShowDate: "asc" }, { queuedForAirAt: "desc" }]
      }),
      suggestAnchorsForDate(dateKey),
      suggestPaForDate(dateKey),
      collectMonthAnchorNames(dateKey.slice(0, 7), dateKey),
      listShowRolesPool(),
      prisma.teleprompterDoc.findFirst({
        where: {
          showDate: new Date(`${dateKey}T12:00:00.000Z`)
        },
        select: {
          id: true
        },
        orderBy: { updatedAt: "desc" }
      }),
      resolveShowManagers([dateKey, ...upcoming])
    ]);

    const calendarAnchors = entry ? extractCalendarAnchors(entry.content) : [];
    const storedAnchors = Array.isArray(show?.anchors)
      ? show.anchors.filter((name): name is string => typeof name === "string" && name.length > 0)
      : [];
    const anchors = calendarAnchors.length > 0 ? calendarAnchors : storedAnchors;
    const assignments =
      show?.assignments && typeof show.assignments === "object" && !Array.isArray(show.assignments)
        ? (show.assignments as Record<string, string>)
        : {};
    const confirmed =
      show?.confirmed && typeof show.confirmed === "object" && !Array.isArray(show.confirmed)
        ? (show.confirmed as Record<string, boolean>)
        : {};

    const packages = queued.map((row) => ({
      id: row.id,
      cycleNumber: row.cycleNumber,
      groupTopic: row.groupTopic,
      custom: isCustomQueuePackage(row),
      queuedForShowDate: row.queuedForShowDate,
      members: row.members.map((member) => userDisplayName(member.user) || member.user.email)
    }));

    return ok({
      date: dateKey,
      label: formatShowDateLabel(dateKey),
      kind: schedule.kind,
      mode: anchorModeForDate(date),
      weekOfMonth: weekOfMonth(date),
      members: castPool.members,
      roles: ROLES,
      anchors,
      paAnnouncers: entry ? extractCalendarPaAnnouncers(entry.content) : [],
      assignments,
      confirmed,
      showManager: showManager.managers[dateKey] ?? { name: "", source: "rotation" as const },
      showManagerPool: showManager.pool,
      monthAnchors,
      suggestedAnchors: suggestion.suggested,
      suggestedPa: paSuggestion.suggested,
      packages: packages.filter((row) => row.queuedForShowDate === dateKey),
      teleprompterDocId: teleprompterDoc?.id ?? null,
      teleprompterHref: teleprompterDoc
        ? `/teleprompter?showDate=${dateKey}&doc=${teleprompterDoc.id}`
        : `/teleprompter?showDate=${dateKey}`,
      upcomingShows: upcoming.map((showDate) => ({
        date: showDate,
        label: formatShowDateLabel(showDate),
        mode: anchorModeForDate(new Date(`${showDate}T12:00:00`)),
        packageCount: packages.filter((row) => row.queuedForShowDate === showDate).length,
        showManager: showManager.managers[showDate]?.name ?? ""
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
