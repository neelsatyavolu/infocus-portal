import { normalizeToss } from "@/src/lib/package-toss";
import { buildShowOccupancy, isCustomQueuePackage, resolveQueuedShowDate } from "@/src/lib/publishing-queue";
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

/** Producers' co-reporters for a queued package's infocusnews.tv byline. Returns the saved names. */
export async function setExtraWriters(rowId: string, names: string[]) {
  const row = await prisma.packageProgressRow.findUnique({ where: { id: rowId }, select: { queuedForAirAt: true } });
  if (!row) throw new Error("NOT_FOUND");
  if (!row.queuedForAirAt) throw new Error("Put this package on the queue first.");
  const saved = await prisma.packageProgressRow.update({ where: { id: rowId }, data: { extraWriters: names }, select: { extraWriters: true } });
  return saved.extraWriters;
}

/**
 * Producers' toss for a custom (uploaded) package, which has no Final Cut tab to write one on.
 * Blank clears it. Feeds the teleprompter and the YouTube description like any toss.
 */
export async function setCustomPackageToss(rowId: string, toss: string) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: { cycleNumber: true, groupType: true, queuedForAirAt: true }
  });
  if (!row) throw new Error("NOT_FOUND");
  if (!isCustomQueuePackage(row)) throw new Error("Write this package's toss on its Final Cut tab.");
  if (!row.queuedForAirAt) throw new Error("Put this package on the queue first.");
  const saved = await prisma.packageProgressRow.update({
    where: { id: rowId },
    data: { finalCutToss: normalizeToss(toss) },
    select: { finalCutToss: true }
  });
  return saved.finalCutToss;
}
