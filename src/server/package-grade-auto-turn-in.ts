import { calculateExtensionDays, getAdminEmailSet, isAdminUserEmail, parseDateInput } from "@/src/lib/extensions";
import { finalCutTurnInDateKey } from "@/src/lib/deadlines";
import { prisma } from "@/src/lib/prisma";

function parseCycleNumberFromProjectName(projectName: string) {
  const match = projectName.match(/package\s+cycle\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const cycleNumber = Number(match[1]);
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > 4) {
    return null;
  }

  return cycleNumber;
}

function isEligibleFolder(folderName: string | null) {
  if (folderName === null) {
    return true;
  }

  return folderName.trim().toLowerCase() === "final cut";
}

export async function syncTurnedInDateForUpload(mediaItemId: string, uploadedAt: Date) {
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    select: {
      project: {
        select: {
          name: true
        }
      },
      folder: {
        select: {
          name: true
        }
      },
      memberAssignments: {
        select: {
          userId: true,
          user: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

  if (!media || !isEligibleFolder(media.folder?.name ?? null) || media.memberAssignments.length === 0) {
    return 0;
  }

  const cycleNumber = parseCycleNumberFromProjectName(media.project.name);
  if (!cycleNumber) {
    return 0;
  }

  const [cycle, adminEmails] = await Promise.all([
    prisma.packageCycle.findUnique({
      where: { cycleNumber },
      select: { finalCutDate: true }
    }),
    getAdminEmailSet()
  ]);

  const turnedInDate = parseDateInput(finalCutTurnInDateKey(uploadedAt, cycle?.finalCutDate ?? null));
  if (!turnedInDate) {
    return 0;
  }

  const calculatedDays = calculateExtensionDays(cycle?.finalCutDate ?? null, turnedInDate);
  const userIds = [
    ...new Set(
      media.memberAssignments
        .filter((assignment) => !isAdminUserEmail(assignment.user.email, adminEmails))
        .map((assignment) => assignment.userId)
    )
  ];
  if (userIds.length === 0) {
    return 0;
  }

  // One read for every member's grade row instead of one per member.
  const alreadyTurnedIn = new Set(
    (
      await prisma.packageGrade.findMany({
        where: { cycleNumber, userId: { in: userIds }, turnedInDate: { not: null } },
        select: { userId: true }
      })
    ).map((grade) => grade.userId)
  );
  const pending = userIds.filter((userId) => !alreadyTurnedIn.has(userId));

  await Promise.all(
    pending.map((userId) =>
      prisma.packageGrade.upsert({
        where: {
          cycleNumber_userId: {
            cycleNumber,
            userId
          }
        },
        update: {
          turnedInDate,
          extensionDaysApplied: calculatedDays,
          freeExtensionDays: 0,
          extensionExempt: false
        },
        create: {
          cycleNumber,
          userId,
          turnedInDate,
          extensionDaysApplied: calculatedDays,
          freeExtensionDays: 0,
          extensionExempt: false
        }
      })
    )
  );
  const updatedCount = pending.length;

  return updatedCount;
}
