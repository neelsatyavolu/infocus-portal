import { type PlatformRole } from "@prisma/client";
import { tallyAnchorPaCounts, type AnchorPaCountRow } from "@/src/lib/anchor-pa-counts";
import {
  extractCalendarAnchors,
  extractCalendarPaAnnouncers,
  extractCalendarShowManager
} from "@/src/lib/calendar-show-content";
import { buildCastPool } from "@/src/lib/cast-pool";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { isCustomQueuePackage } from "@/src/lib/publishing-queue";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { addDaysToDateKey, FIRST_SHOW_DATE } from "@/src/lib/show-assignment";
import {
  SHOW_MANAGER_ROLES,
  buildShowManagerPool,
  resolveShowManagersForDates,
  type ShowManagerAssignment
} from "@/src/lib/show-manager";

export type MasterCalendarEntryDto = {
  date: string;
  content: string;
};

export type MasterCalendarScheduleDay = {
  date: string;
  kind: ScheduleKind;
  label: string;
};

export type MasterCalendarQueuedPackage = {
  id: string;
  groupTopic: string;
  cycleNumber: number;
  custom: boolean;
  date: string | null;
};

export type MasterCalendarMonthData = {
  month: string;
  canEdit: boolean;
  canViewCastCounts: boolean;
  entries: MasterCalendarEntryDto[];
  schedule: MasterCalendarScheduleDay[];
  queuedPackages: MasterCalendarQueuedPackage[];
  members: string[];
  showManagerPool: string[];
  showManagers: Record<string, ShowManagerAssignment>;
};

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CALENDAR_START_MONTH = "2026-09";

export function isMonthKey(value: string) {
  return MONTH_KEY_PATTERN.test(value);
}

export function parseMonthBounds(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    startKey: start.toISOString().slice(0, 10),
    endKey: end.toISOString().slice(0, 10)
  };
}

export function currentCalendarMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!year || !month) {
    return CALENDAR_START_MONTH;
  }
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return key < CALENDAR_START_MONTH ? CALENDAR_START_MONTH : key;
}

function weekdayKeysInMonth(startKey: string, endKey: string) {
  const keys: string[] = [];
  for (let dateKey = startKey; dateKey < endKey; dateKey = addDaysToDateKey(dateKey, 1)) {
    keys.push(dateKey);
  }
  return keys;
}

export async function loadMasterCalendarMonth(
  monthKey: string,
  role: PlatformRole | null
): Promise<MasterCalendarMonthData> {
  const { startKey, endKey } = parseMonthBounds(monthKey);
  const monthDateKeys = weekdayKeysInMonth(startKey, endKey);
  const queryStart = startKey < FIRST_SHOW_DATE ? startKey : FIRST_SHOW_DATE;

  const [entries, calendarRows, queuedRows, users, assignments] = await Promise.all([
    prisma.masterCalendarEntry.findMany({
      where: { date: { gte: queryStart, lt: endKey } },
      select: { date: true, content: true },
      orderBy: { date: "asc" }
    }),
    prisma.schoolCalendarDay.findMany({
      where: { date: { gte: queryStart, lt: endKey } },
      select: { date: true, kind: true, label: true }
    }),
    prisma.packageProgressRow.findMany({
      where: {
        queuedForAirAt: { not: null },
        queuedForShowDate: { gte: startKey, lt: endKey }
      },
      select: {
        id: true,
        groupTopic: true,
        groupType: true,
        cycleNumber: true,
        queuedForShowDate: true
      },
      orderBy: { queuedForAirAt: "desc" }
    }),
    prisma.user.findMany({
      select: { name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.platformRoleAssignment.findMany({
      where: { role: { in: ["ADVISER", "EXECUTIVE_PRODUCER", "SUPER_ADMIN", "ASSOCIATE_PRODUCER"] } },
      select: { email: true, role: true }
    })
  ]);

  const castAssignments = assignments.filter(
    (row) =>
      row.role === "ADVISER" || row.role === "EXECUTIVE_PRODUCER" || row.role === "SUPER_ADMIN"
  );
  const members = buildCastPool(
    users,
    castAssignments.filter((row) => row.role !== "EXECUTIVE_PRODUCER").map((row) => row.email),
    castAssignments.filter((row) => row.role === "EXECUTIVE_PRODUCER").map((row) => row.email)
  ).members;
  const showManagerPool = buildShowManagerPool(
    users,
    assignments
      .filter((row) => (SHOW_MANAGER_ROLES as readonly string[]).includes(row.role))
      .map((row) => row.email)
  );

  const overrideMap = new Map(
    calendarRows.map((row) => [row.date, { kind: row.kind as ScheduleKind, label: row.label }])
  );

  const schedule: MasterCalendarScheduleDay[] = [];
  for (const dateKey of monthDateKeys) {
    const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    schedule.push(resolveScheduleDay(dateKey, overrideMap));
  }

  const overridesByDate = new Map<string, string>();
  for (const entry of entries) {
    const name = extractCalendarShowManager(entry.content);
    if (name) {
      overridesByDate.set(entry.date, name);
    }
  }

  const lastMonthKey = addDaysToDateKey(endKey, -1);
  const showManagers = resolveShowManagersForDates({
    dateKeys: monthDateKeys,
    pool: showManagerPool,
    overridesByDate,
    scheduleOverrides: overrideMap,
    endKey: lastMonthKey
  });

  return {
    month: monthKey,
    canEdit: hasPlatformRole(role, "ASSOCIATE_PRODUCER"),
    canViewCastCounts: hasPlatformRole(role, "EXECUTIVE_PRODUCER"),
    entries: entries
      .filter((entry) => entry.date >= startKey && entry.date < endKey)
      .map((entry) => ({ date: entry.date, content: entry.content })),
    schedule,
    queuedPackages: queuedRows.map((row) => ({
      id: row.id,
      groupTopic: row.groupTopic,
      cycleNumber: row.cycleNumber,
      custom: isCustomQueuePackage(row),
      date: row.queuedForShowDate
    })),
    members,
    showManagerPool,
    showManagers
  };
}

export async function loadAnchorPaCounts(): Promise<{ people: AnchorPaCountRow[] }> {
  const [entries, calendarRows, users, assignments] = await Promise.all([
    prisma.masterCalendarEntry.findMany({
      select: { date: true, content: true }
    }),
    prisma.schoolCalendarDay.findMany({
      select: { date: true, kind: true, label: true }
    }),
    prisma.user.findMany({
      select: { name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.platformRoleAssignment.findMany({
      where: { role: { in: ["ADVISER", "EXECUTIVE_PRODUCER", "SUPER_ADMIN"] } },
      select: { email: true, role: true }
    })
  ]);

  const members = buildCastPool(
    users,
    assignments.filter((row) => row.role !== "EXECUTIVE_PRODUCER").map((row) => row.email),
    assignments.filter((row) => row.role === "EXECUTIVE_PRODUCER").map((row) => row.email)
  ).members;

  const overrideMap = new Map(
    calendarRows.map((row) => [row.date, { kind: row.kind as ScheduleKind, label: row.label }])
  );

  const anchorsByDate: Record<string, string[]> = {};
  const paByDate: Record<string, string[]> = {};
  for (const entry of entries) {
    const kind = resolveScheduleDay(entry.date, overrideMap).kind;
    if (kind === "SHOW") {
      const names = extractCalendarAnchors(entry.content);
      if (names.length > 0) {
        anchorsByDate[entry.date] = names;
      }
    } else if (kind === "PA") {
      const names = extractCalendarPaAnnouncers(entry.content);
      if (names.length > 0) {
        paByDate[entry.date] = names;
      }
    }
  }

  return { people: tallyAnchorPaCounts({ members, anchorsByDate, paByDate }) };
}
