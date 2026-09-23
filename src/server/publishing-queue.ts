import { buildShowOccupancy, resolveQueuedShowDate } from "@/src/lib/publishing-queue";
import { prisma } from "@/src/lib/prisma";
import { listUpcomingShows } from "@/src/server/show-schedule";

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
    listUpcomingShows(16),
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
    upcomingShows: upcoming,
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
