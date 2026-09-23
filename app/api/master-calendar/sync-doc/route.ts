import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { GoogleDocsSyncPermissionError } from "@/src/lib/google-docs-sync";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { parseMonthKey, syncMasterCalendarMonth } from "@/src/server/master-calendar-sync";

function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function parseMonthFromRequestBody(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return parseMonthKey(trimmed);
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = (await request.json().catch(() => ({}))) as { month?: unknown };
    const parsedMonth = parseMonthFromRequestBody(payload.month);

    const now = new Date();
    const targetYear = parsedMonth?.year ?? now.getFullYear();
    const targetMonthIndex = parsedMonth?.monthIndex ?? now.getMonth();
    const targetMonthKey = parsedMonth?.monthKey ?? monthKey(targetYear, targetMonthIndex);
    const result = await syncMasterCalendarMonth(targetMonthKey);
    return ok({ synced: true, entryCount: result.entryCount });
  } catch (error) {
    if (error instanceof GoogleDocsSyncPermissionError) {
      return fail(error.message, 403);
    }

    return handleRouteError(error);
  }
}
