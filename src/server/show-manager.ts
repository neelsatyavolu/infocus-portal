import { prisma } from "@/src/lib/prisma";
import { extractCalendarShowManager } from "@/src/lib/calendar-show-content";
import {
  SHOW_MANAGER_ROLES,
  buildShowManagerPool,
  resolveShowManagersForDates,
  type ShowManagerAssignment
} from "@/src/lib/show-manager";
import { FIRST_SHOW_DATE, isDateKey } from "@/src/lib/show-assignment";
import { loadScheduleOverrides } from "@/src/server/show-schedule";

export async function listShowManagerPool() {
  const [users, assignments] = await Promise.all([
    prisma.user.findMany({
      select: { name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.platformRoleAssignment.findMany({
      where: { role: { in: [...SHOW_MANAGER_ROLES] } },
      select: { email: true }
    })
  ]);
  return buildShowManagerPool(
    users,
    assignments.map((row) => row.email)
  );
}

export async function resolveShowManagers(dateKeys: string[]): Promise<{
  pool: string[];
  managers: Record<string, ShowManagerAssignment>;
}> {
  const unique = [...new Set(dateKeys)].filter(isDateKey);
  const pool = await listShowManagerPool();
  if (unique.length === 0) {
    return { pool, managers: {} };
  }

  const endKey = unique.reduce((latest, dateKey) => (dateKey > latest ? dateKey : latest));
  const [entries, scheduleOverrides] = await Promise.all([
    prisma.masterCalendarEntry.findMany({
      where: { date: { gte: FIRST_SHOW_DATE, lte: endKey } },
      select: { date: true, content: true }
    }),
    loadScheduleOverrides(FIRST_SHOW_DATE, endKey)
  ]);

  const overridesByDate = new Map<string, string>();
  for (const entry of entries) {
    const name = extractCalendarShowManager(entry.content);
    if (name) {
      overridesByDate.set(entry.date, name);
    }
  }

  return {
    pool,
    managers: resolveShowManagersForDates({
      dateKeys: unique,
      pool,
      overridesByDate,
      scheduleOverrides
    })
  };
}
