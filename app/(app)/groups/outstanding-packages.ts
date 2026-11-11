import { isPackageWrappedUp } from "@/src/lib/groups-visibility";
import type { GroupRowView } from "./group-row-model";

/** A package on the All cycles list, with the cycle it belongs to. */
export type OutstandingPackage = { cycleNumber: number; view: GroupRowView };

export type OutstandingCycle = { cycleNumber: number; packages: OutstandingPackage[] };

/** On the All cycles list until it is graded, its grades are published, and it is queued to air. */
export function isOutstandingPackage(row: Parameters<typeof isPackageWrappedUp>[0]) {
  return !isPackageWrappedUp(row);
}

function submittedTime(item: OutstandingPackage) {
  const at = item.view.row.finalCutSubmittedAt;
  return at ? new Date(at).getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Oldest first: by cycle, then by when the Final Cut came in (packages without one after),
 * then by topic. Returned grouped by cycle, oldest cycle first, empty cycles left out.
 */
export function outstandingByCycle(items: OutstandingPackage[]): OutstandingCycle[] {
  const sorted = items
    .filter((item) => isOutstandingPackage(item.view.row))
    .sort(
      (a, b) =>
        a.cycleNumber - b.cycleNumber ||
        submittedTime(a) - submittedTime(b) ||
        a.view.topic.localeCompare(b.view.topic)
    );
  const cycles: OutstandingCycle[] = [];
  for (const item of sorted) {
    const last = cycles.at(-1);
    if (last && last.cycleNumber === item.cycleNumber) {
      cycles[cycles.length - 1] = { ...last, packages: [...last.packages, item] };
    } else {
      cycles.push({ cycleNumber: item.cycleNumber, packages: [item] });
    }
  }
  return cycles;
}
