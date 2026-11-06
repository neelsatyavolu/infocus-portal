/**
 * Projected overflow: how many packages this school year will make that no show day is left to
 * air. One package per show day; special (named or held) show days air no package, and we
 * expect a couple of shows a semester to lose their package slot to something unplanned.
 */

/** Show days a semester that end up airing no package (assemblies, recaps, a lost day). */
export const SHOWS_WITHOUT_PACKAGE_PER_SEMESTER = 2;

export type ProjectionCycle = {
  cycleNumber: number;
  /** Roster packages with a topic. */
  packages: number;
  /** The cycle's Final Cut date has passed, so its count is final. */
  finished: boolean;
};

export type ProjectionShowDay = { date: string; special: boolean };

export type OverflowProjection = {
  overflow: number;
  /** Packages the whole year is expected to make (cycles 1…N, rounded). */
  projectedPackages: number;
  /** Projected packages not aired yet, plus custom packages queued from today on. */
  packagesLeftToAir: number;
  /** Show days from today through the last day of school that can take a package. */
  slotsLeft: number;
  averagePerCycle: number;
  cyclesInYear: number;
  lastDay: string;
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** The average package count: finished cycles when there are any, else any cycle with packages. */
export function averagePackagesPerCycle(cycles: readonly ProjectionCycle[]) {
  const withPackages = cycles.filter((cycle) => cycle.packages > 0);
  const finished = withPackages.filter((cycle) => cycle.finished);
  return mean((finished.length ? finished : withPackages).map((cycle) => cycle.packages));
}

/** Finished cycles count as made; a cycle still under way or not started counts as at least average. */
export function projectYearPackages(cycles: readonly ProjectionCycle[], cyclesInYear: number, average: number) {
  let total = 0;
  for (let cycleNumber = 1; cycleNumber <= cyclesInYear; cycleNumber += 1) {
    const cycle = cycles.find((entry) => entry.cycleNumber === cycleNumber);
    if (cycle?.finished) total += cycle.packages;
    else total += Math.max(cycle?.packages ?? 0, average);
  }
  return Math.round(total);
}

/**
 * Package slots left: regular show days, less the expected lost shows per semester. Named or
 * held show days already in a semester count toward its lost shows.
 */
export function packageSlotsLeft(days: readonly ProjectionShowDay[], secondSemesterStart: string | null) {
  const semesters = secondSemesterStart
    ? [days.filter((day) => day.date < secondSemesterStart), days.filter((day) => day.date >= secondSemesterStart)]
    : [days];
  return semesters.reduce((slots, semester) => {
    if (semester.length === 0) return slots;
    const special = semester.filter((day) => day.special).length;
    const regular = semester.length - special;
    const stillLost = Math.max(0, SHOWS_WITHOUT_PACKAGE_PER_SEMESTER - special);
    return slots + Math.max(0, regular - stillLost);
  }, 0);
}

export function projectOverflow(input: {
  cycles: readonly ProjectionCycle[];
  cyclesInYear: number;
  /** Roster packages (cycle 1+) queued for a show before today. */
  airedPackages: number;
  /** Custom packages queued for today or later, or with no show yet: they take slots too. */
  upcomingCustomPackages: number;
  /** Show days from today through `lastDay`. */
  showDays: readonly ProjectionShowDay[];
  secondSemesterStart: string | null;
  lastDay: string;
}): OverflowProjection | null {
  const average = averagePackagesPerCycle(input.cycles);
  if (average === null) return null;
  const projectedPackages = projectYearPackages(input.cycles, input.cyclesInYear, average);
  const packagesLeftToAir = Math.max(0, projectedPackages - input.airedPackages) + input.upcomingCustomPackages;
  const slotsLeft = packageSlotsLeft(input.showDays, input.secondSemesterStart);
  return {
    overflow: Math.max(0, packagesLeftToAir - slotsLeft),
    projectedPackages,
    packagesLeftToAir,
    slotsLeft,
    averagePerCycle: Math.round(average * 10) / 10,
    cyclesInYear: input.cyclesInYear,
    lastDay: input.lastDay
  };
}
