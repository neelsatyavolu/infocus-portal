import { GoogleDocsSyncPermissionError, syncCalendarToGoogleDoc } from "@/src/lib/google-docs-sync";
import { prisma } from "@/src/lib/prisma";
import { type ScheduleKind } from "@/src/lib/school-schedule";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import { resolveShowManagers } from "@/src/server/show-manager";

import { syncTeleprompterAnchorNames } from "@/src/server/teleprompter-anchors";

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const IDLE_SYNC_WAIT_MS = 60_000;
const MAX_SYNC_ERROR_LENGTH = 500;

type ParsedMonth = {
  monthKey: string;
  year: number;
  monthIndex: number;
  startKey: string;
  endKey: string;
};

function truncateErrorMessage(value: string) {
  return value.length <= MAX_SYNC_ERROR_LENGTH ? value : `${value.slice(0, MAX_SYNC_ERROR_LENGTH - 3)}...`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return truncateErrorMessage(error.message || "Unknown sync error");
  }
  return "Unknown sync error";
}

function isMissingSyncStateTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "P2021") {
    return true;
  }
  return typeof candidate.message === "string" && candidate.message.includes("MasterCalendarSyncState");
}

export function parseMonthKey(value: string): ParsedMonth {
  const trimmed = value.trim();
  const match = MONTH_KEY_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error("BAD_REQUEST");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthIndex = month - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));

  return {
    monthKey: trimmed,
    year,
    monthIndex,
    startKey: start.toISOString().slice(0, 10),
    endKey: end.toISOString().slice(0, 10)
  };
}

export function monthKeyFromDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("BAD_REQUEST");
  }
  return dateKey.slice(0, 7);
}

export async function markMasterCalendarEdited(dateKey: string, editedAt = new Date()) {
  const monthKey = monthKeyFromDateKey(dateKey);
  try {
    await prisma.masterCalendarSyncState.upsert({
      where: { monthKey },
      create: {
        monthKey,
        lastEditedAt: editedAt
      },
      update: {
        lastEditedAt: editedAt
      }
    });
  } catch (error) {
    if (!isMissingSyncStateTableError(error)) {
      throw error;
    }
  }
  await syncTeleprompterAnchorNames({ dateKey });
}

async function markSyncSuccess(monthKey: string, syncedAt = new Date()) {
  try {
    await prisma.masterCalendarSyncState.upsert({
      where: { monthKey },
      create: {
        monthKey,
        lastEditedAt: syncedAt,
        lastSyncedAt: syncedAt,
        lastSyncAttemptAt: syncedAt,
        lastSyncError: null
      },
      update: {
        lastSyncedAt: syncedAt,
        lastSyncAttemptAt: syncedAt,
        lastSyncError: null
      }
    });
  } catch (error) {
    if (!isMissingSyncStateTableError(error)) {
      throw error;
    }
  }
}

async function markSyncFailure(monthKey: string, syncError: string, attemptedAt = new Date()) {
  try {
    await prisma.masterCalendarSyncState.upsert({
      where: { monthKey },
      create: {
        monthKey,
        lastEditedAt: attemptedAt,
        lastSyncAttemptAt: attemptedAt,
        lastSyncError: syncError
      },
      update: {
        lastSyncAttemptAt: attemptedAt,
        lastSyncError: syncError
      }
    });
  } catch (error) {
    if (!isMissingSyncStateTableError(error)) {
      throw error;
    }
  }
}

export async function syncMasterCalendarMonth(monthKeyValue: string) {
  const parsed = parseMonthKey(monthKeyValue);
  const [entries, calendarRows] = await Promise.all([
    prisma.masterCalendarEntry.findMany({
      where: {
        date: { gte: parsed.startKey, lt: parsed.endKey }
      },
      select: { date: true, content: true }
    }),
    prisma.schoolCalendarDay.findMany({
      where: {
        date: { gte: parsed.startKey, lt: parsed.endKey }
      },
      select: { date: true, kind: true, label: true }
    })
  ]);

  const scheduleOverrides = calendarRows.map((row) => ({
    date: row.date,
    kind: row.kind as ScheduleKind,
    label: row.label
  }));

  const monthDateKeys: string[] = [];
  for (let dateKey = parsed.startKey; dateKey < parsed.endKey; dateKey = addDaysToDateKey(dateKey, 1)) {
    monthDateKeys.push(dateKey);
  }
  const resolvedManagers = await resolveShowManagers(monthDateKeys);
  const showManagers = Object.fromEntries(
    Object.entries(resolvedManagers.managers).map(([dateKey, assignment]) => [dateKey, assignment.name])
  );

  try {
    await syncCalendarToGoogleDoc([{ monthKey: parsed.monthKey, entries, scheduleOverrides, showManagers }]);
    await markSyncSuccess(parsed.monthKey);
    return { monthKey: parsed.monthKey, entryCount: entries.length };
  } catch (error) {
    await markSyncFailure(parsed.monthKey, errorMessage(error));
    if (error instanceof GoogleDocsSyncPermissionError) {
      throw error;
    }
    throw error;
  }
}

export async function getPendingMasterCalendarSyncMonths(now = new Date(), limit = 12) {
  const cutoff = new Date(now.getTime() - IDLE_SYNC_WAIT_MS);
  let states: Array<{ monthKey: string; lastEditedAt: Date; lastSyncedAt: Date | null }> = [];
  try {
    states = await prisma.masterCalendarSyncState.findMany({
      where: {
        lastEditedAt: {
          lte: cutoff
        }
      },
      orderBy: {
        lastEditedAt: "asc"
      },
      take: limit,
      select: {
        monthKey: true,
        lastEditedAt: true,
        lastSyncedAt: true
      }
    });
  } catch (error) {
    if (isMissingSyncStateTableError(error)) {
      return [];
    }
    throw error;
  }

  return states
    .filter((state) => !state.lastSyncedAt || state.lastSyncedAt < state.lastEditedAt)
    .map((state) => state.monthKey);
}
