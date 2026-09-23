import { calculateExtensionDays, getAdminEmailSet, isAdminUserEmail, parseDateInput } from "@/src/lib/extensions";
import { prisma } from "@/src/lib/prisma";

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function formatPacificDateKey(date: Date) {
  const parts = PACIFIC_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("FAILED_TO_FORMAT_DATE");
  }

  return `${year}-${month}-${day}`;
}

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

  const turnedInDate = parseDateInput(formatPacificDateKey(uploadedAt));
  if (!turnedInDate) {
    return 0;
  }

  const [cycle, adminEmails] = await Promise.all([
    prisma.packageCycle.findUnique({
      where: { cycleNumber },
      select: { finalCutDate: true }
    }),
    getAdminEmailSet()
  ]);

  const calculatedDays = calculateExtensionDays(cycle?.finalCutDate ?? null, turnedInDate);
  let updatedCount = 0;

  for (const assignment of media.memberAssignments) {
    if (isAdminUserEmail(assignment.user.email, adminEmails)) {
      continue;
    }

    const existing = await prisma.packageGrade.findUnique({
      where: {
        cycleNumber_userId: {
          cycleNumber,
          userId: assignment.userId
        }
      },
      select: {
        turnedInDate: true
      }
    });

    if (existing?.turnedInDate) {
      continue;
    }

    await prisma.packageGrade.upsert({
      where: {
        cycleNumber_userId: {
          cycleNumber,
          userId: assignment.userId
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
        userId: assignment.userId,
        turnedInDate,
        extensionDaysApplied: calculatedDays,
        freeExtensionDays: 0,
        extensionExempt: false
      }
    });
    updatedCount += 1;
  }

  return updatedCount;
}
