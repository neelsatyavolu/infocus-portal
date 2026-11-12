import { handleRouteError } from "@/src/lib/api-errors";
import { buildCsv, csvFilename, csvResponse } from "@/src/lib/csv";
import { semesterForDate } from "@/src/lib/livestream";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { loadExportViewer } from "@/src/server/export-viewer";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Every saved participation score (one row per student per day), oldest day first. Same access as
 * the Grade Editor Participation tab: executive producers, the adviser and super admin. Pending
 * docks are not saved scores yet, so they are left out.
 */
export async function GET() {
  try {
    const { role } = await loadExportViewer();
    if (!hasPlatformRole(role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const entries = await prisma.participationEntry.findMany({
      select: {
        date: true,
        points: true,
        notes: true,
        updatedAt: true,
        user: { select: { name: true, nickname: true, email: true } }
      },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    });

    const csv = buildCsv(
      ["Date", "Day", "Semester", "Name", "Email", "Points", "Comment", "Last saved"],
      entries.map((entry) => [
        // Participation dates are stored at UTC midnight of the school day.
        entry.date.toISOString().slice(0, 10),
        WEEKDAY[entry.date.getUTCDay()],
        semesterForDate(entry.date).label,
        userDisplayName(entry.user) || entry.user.email,
        entry.user.email,
        entry.points,
        entry.notes,
        entry.updatedAt.toISOString()
      ])
    );
    return csvResponse(csvFilename("participation"), csv);
  } catch (error) {
    return handleRouteError(error);
  }
}
