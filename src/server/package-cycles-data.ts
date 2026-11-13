import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { cycleDatesNumbers, getCyclesPerSemester, getCycleNumbers } from "@/src/server/program-settings";

export function toDateKey(value: Date | null) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Creates any cycle row the semester needs but the table doesn't have yet. */
export async function ensureDefaultCycles() {
  const cycleNumbers = await getCycleNumbers();
  const existing = await prisma.packageCycle.findMany({
    select: { cycleNumber: true }
  });

  const existingSet = new Set(existing.map((cycle) => cycle.cycleNumber));
  const missing = cycleNumbers.filter((cycleNumber) => !existingSet.has(cycleNumber));

  if (missing.length > 0) {
    await prisma.packageCycle.createMany({
      data: missing.map((cycleNumber) => ({
        cycleNumber,
        focus: ""
      }))
    });
  }
}

/** GET /api/package-cycles for this role (the Cycle Dates page loads it too, for first paint). */
export async function loadPackageCycles(role: PlatformRole | null) {
  const canEdit = hasPlatformRole(role, "ASSOCIATE_PRODUCER");
  const canEditCycleCount = hasPlatformRole(role, "EXECUTIVE_PRODUCER");
  const cyclesPerSemester = await getCyclesPerSemester();

  await ensureDefaultCycles();

  // Semester 2's cycles show here even before the count reaches them; a cycle without a row yet
  // shows with no dates, and its first save creates the row.
  const cycleNumbers = cycleDatesNumbers(cyclesPerSemester);
  const cycles = await prisma.packageCycle.findMany({
    where: { cycleNumber: { in: cycleNumbers } },
    orderBy: { cycleNumber: "asc" }
  });
  const byNumber = new Map(cycles.map((cycle) => [cycle.cycleNumber, cycle]));

  return {
    canEdit,
    canEditCycleCount,
    cyclesPerSemester,
    cycles: cycleNumbers.map((cycleNumber) => {
      const cycle = byNumber.get(cycleNumber);
      return {
        cycleNumber,
        focus: cycle?.focus ?? "",
        pitchingDate: toDateKey(cycle?.pitchingDate ?? null),
        proofOfContactDate: toDateKey(cycle?.proofOfContactDate ?? null),
        aRollBRollDate: toDateKey(cycle?.aRollBRollDate ?? null),
        initialCutDate: toDateKey(cycle?.initialCutDate ?? null),
        finalCutDate: toDateKey(cycle?.finalCutDate ?? null)
      };
    })
  };
}
