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

  const upcoming = await listUpcomingShowDays(16);
  // Special shows (e.g. Spirit Week recaps) only get packages placed by hand.
  const upcomingShows = upcoming.filter((day) => !isSpecialShowDay(day)).map((day) => day.date);

  // Serialize placements so two producers can't both pass the per-show cap.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('infocus-publishing-queue'), 0)`;
    const [current, occupiedRows] = await Promise.all([
      tx.packageProgressRow.findUniqueOrThrow({
        where: { id: rowId },
        select: { finalCutMediaItemId: true, queuedForAirAt: true, queuedForShowDate: true }
      }),
      tx.packageProgressRow.findMany({
        where: {
          queuedForAirAt: { not: null },
          queuedForShowDate: { not: null },
          id: { not: rowId }
        },
        select: { id: true, queuedForShowDate: true }
      })
    ]);
    if (!current.finalCutMediaItemId) {
      throw new Error("A final cut is required before a package can join the publishing queue.");
    }

    const nextShow = resolveQueuedShowDate({
      requestedShowDate: showDate,
      currentShowDate: current.queuedForShowDate,
      upcomingShows,
      occupancy: buildShowOccupancy(occupiedRows)
    });

    return tx.packageProgressRow.update({
      where: { id: rowId },
      data: {
        queuedForAirAt: current.queuedForAirAt ?? new Date(),
        queuedForShowDate: nextShow
      }
    });
  });
}
