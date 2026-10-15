import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getCyclesPerSemester, getCycleNumbers } from "@/src/server/program-settings";

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

  const cycles = await prisma.packageCycle.findMany({
    where: { cycleNumber: { lte: cyclesPerSemester } },
    orderBy: { cycleNumber: "asc" }
  });

  return {
    canEdit,
    canEditCycleCount,
    cyclesPerSemester,
    cycles: cycles.map((cycle) => ({
      cycleNumber: cycle.cycleNumber,
      focus: cycle.focus,
      pitchingDate: toDateKey(cycle.pitchingDate),
      proofOfContactDate: toDateKey(cycle.proofOfContactDate),
      aRollBRollDate: toDateKey(cycle.aRollBRollDate),
      initialCutDate: toDateKey(cycle.initialCutDate),
      finalCutDate: toDateKey(cycle.finalCutDate)
    }))
  };
}
