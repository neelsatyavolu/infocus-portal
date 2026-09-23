import { NextRequest, NextResponse } from "next/server";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { withAssociateShowManagers } from "@/src/server/show-roles-history";

type ShowState = {
  date: string;
  assignments: Record<string, string>;
  anchors: string[];
  confirmed: Record<string, boolean>;
};

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

function normalizeShows(shows: unknown): ShowState[] {
  if (!Array.isArray(shows)) return [];

  return shows
    .filter((show): show is Record<string, unknown> => Boolean(show && typeof show === "object"))
    .filter((show) => typeof show.date === "string")
    .map((show) => ({
      date: String(show.date),
      assignments:
        show.assignments && typeof show.assignments === "object" && !Array.isArray(show.assignments)
          ? (show.assignments as Record<string, string>)
          : {},
      anchors: Array.isArray(show.anchors)
        ? show.anchors.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 2)
        : [],
      confirmed:
        show.confirmed && typeof show.confirmed === "object" && !Array.isArray(show.confirmed)
          ? (show.confirmed as Record<string, boolean>)
          : {}
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray((body as { shows?: unknown[] }).shows)) {
    return json({ error: "Invalid data format. Expected { shows: [] }." }, 400);
  }

  try {
    const shows = normalizeShows((body as { shows: unknown[] }).shows);
    const dates = shows.map((show) => show.date);
    const resolvedShows = await withAssociateShowManagers(shows);

    await prisma.$transaction(async (tx) => {
      if (dates.length > 0) {
        await tx.showRolesShow.deleteMany({
          where: {
            date: {
              notIn: dates
            }
          }
        });
      } else {
        await tx.showRolesShow.deleteMany();
      }

      for (const show of shows) {
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
    });

    return json({ success: true, saved: shows.length, shows: resolvedShows });
  } catch (error) {
    console.error("Show roles POST failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
}
