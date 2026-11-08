import { buildShowOccupancy, resolveQueuedShowDate } from "@/src/lib/publishing-queue";
import { prisma } from "@/src/lib/prisma";
import { isSpecialShowDay } from "@/src/lib/school-schedule";
import { listUpcomingShowDays } from "@/src/server/show-schedule";

export async function setQueuedForAir(rowId: string, queued: boolean, showDate?: string | null) {
  const row = await prisma.packageProgressRow.findUniqueOrThrow({
    where: { id: rowId },
    select: {
      queuedForAirAt: true,
      queuedForShowDate: true,
      finalCutMediaItem: { select: { deletedAt: true, currentVersion: { select: { id: true, status: true } } } }
    }
  });
  if (!queued) {
    return prisma.packageProgressRow.update({
      where: { id: rowId },
      data: { queuedForAirAt: null, queuedForShowDate: null, queuedMediaVersionId: null }
    });
  }
  // YouTube publishes only the version that was current when a producer queued (or re-queued) the package.
  const currentCut = row.finalCutMediaItem?.deletedAt ? null : row.finalCutMediaItem?.currentVersion;
  const queuedMediaVersionId = currentCut?.status === "READY" ? currentCut.id : null;
  // A package may hold its show before its final cut is in: the queue marks it, the show editor
  // and YouTube skip it until the upload lands (they read the final cut at run time).

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
      queuedForShowDate: nextShow,
      queuedMediaVersionId
    }
  });
}
