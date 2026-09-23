export type MissingGradeStatus = "not_entered" | "unpublished";

export interface MissingGradeEntry {
  cycleNumber: number;
  status: MissingGradeStatus;
}

export interface MissingPersonReport {
  userId: string;
  name: string | null;
  email: string | null;
  missing: MissingGradeEntry[];
}

export interface MissingGradePerson {
  id: string;
  name: string | null;
  nickname?: string | null;
  email: string | null;
}

export interface MissingGradeFact {
  userId: string;
  cycleNumber: number;
  published: boolean;
  finalCutState?: "UNGRADED" | "EXEMPT" | null;
}

export interface MissingGradeReport {
  consideredCycleNumbers: number[];
  report: MissingPersonReport[];
}

function gradeKey(userId: string, cycleNumber: number) {
  return `${userId}:${cycleNumber}`;
}

/**
 * Determine which people are missing a grade and for which cycles.
 *
 * A cycle is only considered if it has "started" — i.e. at least one grade exists
 * for that cycle. For each started cycle, a person is missing when they have no
 * grade ("not_entered") or a grade that is not yet published ("unpublished").
 *
 * Pure function: input order of `people` is preserved in the report.
 */
export function computeMissingGradeReport(input: {
  people: MissingGradePerson[];
  grades: MissingGradeFact[];
  cycleNumbers: number[];
  /** Associates are only missing grades on packages they joined. */
  associateUserIds?: ReadonlySet<string>;
  memberCycleNumbersByUserId?: ReadonlyMap<string, ReadonlySet<number>>;
}): MissingGradeReport {
  const validCycles = new Set(input.cycleNumbers);

  const startedCycles = new Set<number>();
  const gradeByUserCycle = new Map<string, MissingGradeFact>();
  for (const grade of input.grades) {
    if (!validCycles.has(grade.cycleNumber)) {
      continue;
    }
    startedCycles.add(grade.cycleNumber);
    gradeByUserCycle.set(gradeKey(grade.userId, grade.cycleNumber), grade);
  }

  const consideredCycleNumbers = input.cycleNumbers
    .filter((cycleNumber) => startedCycles.has(cycleNumber))
    .sort((a, b) => a - b);

  const report: MissingPersonReport[] = [];
  for (const person of input.people) {
    const missing: MissingGradeEntry[] = [];
    const associate = input.associateUserIds?.has(person.id) ?? false;
    const memberCycles = input.memberCycleNumbersByUserId?.get(person.id);
    for (const cycleNumber of consideredCycleNumbers) {
      if (associate && !memberCycles?.has(cycleNumber)) {
        continue;
      }
      const grade = gradeByUserCycle.get(gradeKey(person.id, cycleNumber));
      if (grade?.finalCutState === "EXEMPT") continue;
      if (!grade || grade.finalCutState === "UNGRADED") {
        missing.push({ cycleNumber, status: "not_entered" });
      } else if (!grade.published) {
        missing.push({ cycleNumber, status: "unpublished" });
      }
    }

    if (missing.length > 0) {
      report.push({
        userId: person.id,
        name: person.nickname?.trim() || person.name,
        email: person.email,
        missing
      });
    }
  }

  return { consideredCycleNumbers, report };
}
