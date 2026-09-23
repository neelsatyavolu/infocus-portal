/**
 * Seeds the 2026-27 package cycle dates from the InFocus Master Document.
 *
 * Cycle 2 is intentionally NOT seeded: the master document lists its A-roll as
 * September 16 and its initial cut as September 21, both of which fall before
 * its own October 2 pitching date and overlap Cycle 1. Those look like typos
 * for October 16 / October 21, so the dates are left blank to be entered by
 * hand on /package-cycles rather than seeded wrong.
 *
 * Run with: npx tsx prisma/seed-cycles-2026-27.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

const CYCLES = [
  {
    cycleNumber: 1,
    pitchingDate: date("2026-08-28"),
    proofOfContactDate: date("2026-09-02"),
    aRollBRollDate: date("2026-09-11"),
    initialCutDate: date("2026-09-16"),
    finalCutDate: date("2026-09-30")
  },
  {
    cycleNumber: 3,
    pitchingDate: date("2026-11-06"),
    proofOfContactDate: date("2026-11-11"),
    aRollBRollDate: date("2026-11-20"),
    initialCutDate: date("2026-11-30"),
    finalCutDate: date("2026-12-11")
  }
];

async function main() {
  for (const cycle of CYCLES) {
    await prisma.packageCycle.upsert({
      where: { cycleNumber: cycle.cycleNumber },
      update: cycle,
      create: { ...cycle, focus: "" }
    });

    console.info(`Seeded cycle ${cycle.cycleNumber}`);
  }

  // Make sure Cycle 2 exists so it shows up as a tab, just without dates.
  await prisma.packageCycle.upsert({
    where: { cycleNumber: 2 },
    update: {},
    create: { cycleNumber: 2, focus: "" }
  });

  console.info("Cycle 2 left blank — enter its dates on /package-cycles.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
