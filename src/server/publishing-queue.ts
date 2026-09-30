import { buildShowOccupancy, resolveQueuedShowDate } from "@/src/lib/publishing-queue";
import { prisma } from "@/src/lib/prisma";
import { isSpecialShowDay } from "@/src/lib/school-schedule";
import { listUpcomingShowDays } from "@/src/server/show-schedule";

export async function setQueuedForAir(rowId: string, queued: boolean, showDate?: string | null) {
  const row = await prisma.packageProgressRow.findUniqueOrThrow({
    where: { id: rowId },
    select: { finalCutMediaItemId: true, queuedForAirAt: true, queuedForShowDate: true }
  });
  if (!queued) {
    return prisma.packageProgressRow.update({
      where: { id: rowId },
      data: { queuedForAirAt: null, queuedForShowDate: null }
    });
  }
  if (!row.finalCutMediaItemId) {
    throw new Error("A final cut is required before a package can join the publishing queue.");
  }

  const [upcoming, occupiedRows] = await Promise.all([
    listUpcomingShowDays(16),
    prisma.packageProgressRow.findMany({
      where: {
        queuedForAirAt: { not: null },
        queuedForShowDate: { not: null },
        id: { not: rowId }
      },
      select: { id: true, queuedForShowDate: true }
    })
  ]);

  const nextShow = resolveQueuedShowDate({
    requestedShowDate: showDate,
    currentShowDate: row.queuedForShowDate,
    // Special shows (e.g. Spirit Week recaps) only get packages placed by hand.
    upcomingShows: upcoming.filter((day) => !isSpecialShowDay(day)).map((day) => day.date),
    occupancy: buildShowOccupancy(occupiedRows)
  });

  return prisma.packageProgressRow.update({
    where: { id: rowId },
    data: {
      queuedForAirAt: row.queuedForAirAt ?? new Date(),
      queuedForShowDate: nextShow
    }
  });
}
