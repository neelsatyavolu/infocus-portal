import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { seededCalendarEntries, type ScheduleKind } from "@/src/lib/school-schedule";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";

const kindSchema = z.enum(["PA", "SHOW", "NONE", "HOLIDAY"]);

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: kindSchema,
  label: z.string().max(120).optional()
});

const deleteSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function GET() {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);

    const rows = await prisma.schoolCalendarDay.findMany({
      orderBy: { date: "asc" }
    });

    const byDate = new Map(rows.map((row) => [row.date, row]));
    const seeded = seededCalendarEntries().map((entry) => {
      const override = byDate.get(entry.date);
      if (override) {
        return {
          date: override.date,
          kind: override.kind as ScheduleKind,
          label: override.label || entry.label,
          source: override.source as "seed" | "manual"
        };
      }
      return entry;
    });

    // Manual-only rows not in seed
    for (const row of rows) {
      if (!seeded.some((entry) => entry.date === row.date)) {
        seeded.push({
          date: row.date,
          kind: row.kind as ScheduleKind,
          label: row.label,
          source: (row.source as "seed" | "manual") || "manual"
        });
      }
    }

    seeded.sort((a, b) => a.date.localeCompare(b.date));

    return ok({ days: seeded });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAccounts && !access.isExecutiveProducer && !access.isAdviser) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:calendar:write"), {
      max: 40,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = upsertSchema.parse(await request.json());
    const row = await prisma.schoolCalendarDay.upsert({
      where: { date: payload.date },
      create: {
        date: payload.date,
        kind: payload.kind,
        label: payload.label?.trim() || "",
        source: "manual"
      },
      update: {
        kind: payload.kind,
        label: payload.label?.trim() || "",
        source: "manual"
      }
    });

    return ok(row, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAccounts && !access.isExecutiveProducer && !access.isAdviser) {
      throw new Error("FORBIDDEN");
    }

    const { searchParams } = new URL(request.url);
    const payload = deleteSchema.parse({ date: searchParams.get("date") });

    await prisma.schoolCalendarDay.deleteMany({ where: { date: payload.date } });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
