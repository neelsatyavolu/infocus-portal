import { NextRequest, NextResponse } from "next/server";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { withAssociateShowManagers } from "@/src/server/show-roles-history";
import { planShowRolesSave, ShowRolesConflictError, showRolesSaveSchema } from "@/src/server/show-roles-save";

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function assertShowRolesAccess() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      return json({ error: "Forbidden" }, 403);
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return json({ error: "Forbidden" }, 403);
    }

    return json({ error: "Unauthorized" }, 401);
  }
}

export async function GET() {
  const accessError = await assertShowRolesAccess();
  if (accessError) {
    return accessError;
  }

  try {
    const records = await prisma.showRolesShow.findMany({
      orderBy: {
        date: "asc"
      }
    });

    const shows = records.map((record) => ({
      date: record.date,
      assignments:
        record.assignments && typeof record.assignments === "object" && !Array.isArray(record.assignments)
          ? (record.assignments as Record<string, string>)
          : {},
      anchors: Array.isArray(record.anchors)
        ? record.anchors.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 2)
        : [],
      confirmed:
        record.confirmed && typeof record.confirmed === "object" && !Array.isArray(record.confirmed)
          ? (record.confirmed as Record<string, boolean>)
          : {}
    }));

    return json({ shows: await withAssociateShowManagers(shows) });
  } catch (error) {
    console.error("Show roles GET failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
}

export async function POST(request: NextRequest) {
  const accessError = await assertShowRolesAccess();
  if (accessError) {
    return accessError;
  }

  const parsed = showRolesSaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Invalid save request. Reload the page and try again." }, 400);
  }
  const save = parsed.data;

  try {
    const written = await prisma.$transaction(async (tx) => {
      const dates = [...new Set([...save.shows.map((show) => show.date), ...save.deletedDates])];
      const stored = await tx.showRolesShow.findMany({
        where: { date: { in: dates } },
        select: { date: true, assignments: true, anchors: true, confirmed: true }
      });
      const plan = planShowRolesSave(save, stored);
      if (plan.conflicts.length > 0) {
        throw new ShowRolesConflictError(plan.conflicts);
      }

      // Only dates this tab removed, and only while they still hold what it loaded.
      if (plan.deletes.length > 0) {
        await tx.showRolesShow.deleteMany({ where: { date: { in: plan.deletes } } });
      }
      for (const show of plan.writes) {
        await tx.showRolesShow.upsert({
          where: { date: show.date },
          create: {
            date: show.date,
            assignments: show.assignments,
            anchors: show.anchors,
            confirmed: show.confirmed
          },
          update: {
            assignments: show.assignments,
            anchors: show.anchors,
            confirmed: show.confirmed
          }
        });
      }
      return plan.writes.length;
    });

    const shows = [...new Map(save.shows.map((show) => [show.date, show])).values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    return json({ success: true, saved: written, shows: await withAssociateShowManagers(shows) });
  } catch (error) {
    if (error instanceof ShowRolesConflictError) {
      return json({ error: error.message, conflicts: error.dates }, 409);
    }
    console.error("Show roles POST failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
}
