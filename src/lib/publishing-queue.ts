/** Sentinel cycle for producer-uploaded queue items that are not package-cycle groups. */
export const CUSTOM_QUEUE_CYCLE_NUMBER = 0;
export const CUSTOM_QUEUE_GROUP_TYPE = "CUSTOM_QUEUE";
export const CUSTOM_QUEUE_PROJECT_NAME = "Publishing Queue";

/** Manual placement cap. Automatic assignment never stacks — it picks an empty show. */
export const MAX_PACKAGES_PER_SHOW = 2;
export const UNASSIGNED_SHOW_KEY = "unassigned";

export const QUEUE_SHOW_FULL_MESSAGE = `That show already has ${MAX_PACKAGES_PER_SHOW} packages.`;
export const QUEUE_NO_EMPTY_SHOW_MESSAGE =
  "Every upcoming show already has a package. Drag this onto a show that has room (max 2).";

export function isCustomQueuePackage(row: {
  cycleNumber?: number | null;
  groupType?: string | null;
}) {
  return row.cycleNumber === CUSTOM_QUEUE_CYCLE_NUMBER || row.groupType === CUSTOM_QUEUE_GROUP_TYPE;
}

export function queuePackageSubtitle(row: {
  custom?: boolean;
  cycleNumber: number;
  groupType?: string | null;
  members: Array<string | null>;
}) {
  if (row.custom || isCustomQueuePackage(row)) {
    return "Custom";
  }
  const members = row.members.filter(Boolean).join(", ");
  return members ? `Cycle ${row.cycleNumber} · ${members}` : `Cycle ${row.cycleNumber}`;
}

export function buildShowOccupancy(
  rows: Array<{ id: string; queuedForShowDate: string | null }>,
  excludeRowId?: string
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.queuedForShowDate || row.id === excludeRowId) continue;
    counts.set(row.queuedForShowDate, (counts.get(row.queuedForShowDate) ?? 0) + 1);
  }
  return counts;
}

export function pickAutomaticShowDate(
  upcomingShows: string[],
  occupancy: ReadonlyMap<string, number>
) {
  return upcomingShows.find((date) => (occupancy.get(date) ?? 0) === 0) ?? null;
}

export function canManuallyPlaceOnShow(occupiedExcludingSelf: number) {
  return occupiedExcludingSelf < MAX_PACKAGES_PER_SHOW;
}

export function resolveQueuedShowDate(input: {
  requestedShowDate?: string | null;
  currentShowDate?: string | null;
  upcomingShows: string[];
  occupancy: ReadonlyMap<string, number>;
}) {
  const requested = input.requestedShowDate?.trim() || "";
  if (requested) {
    const staying = requested === input.currentShowDate;
    const occupied = input.occupancy.get(requested) ?? 0;
    if (!staying && !canManuallyPlaceOnShow(occupied)) {
      throw new Error(QUEUE_SHOW_FULL_MESSAGE);
    }
    return requested;
  }
  if (input.currentShowDate) {
    return input.currentShowDate;
  }
  const automatic = pickAutomaticShowDate(input.upcomingShows, input.occupancy);
  if (!automatic) {
    throw new Error(QUEUE_NO_EMPTY_SHOW_MESSAGE);
  }
  return automatic;
}

export function isPastQueuedShowDate(
  date: string | null,
  upcomingDates: string[],
  today?: string
) {
  if (!date) return false;
  if (upcomingDates.includes(date)) return false;
  const cutoff = today ?? upcomingDates[0];
  return !cutoff || date < cutoff;
}

export function groupQueueSections<T extends { queuedForShowDate: string | null }>(
  rows: T[],
  upcomingDates: string[],
  today?: string
): Array<{ date: string; rows: T[] }> {
  const byDate = new Map<string, T[]>();
  for (const date of upcomingDates) {
    byDate.set(date, []);
  }
  for (const row of rows) {
    const key = row.queuedForShowDate ?? UNASSIGNED_SHOW_KEY;
    if (isPastQueuedShowDate(key === UNASSIGNED_SHOW_KEY ? null : key, upcomingDates, today)) {
      continue;
    }
    const list = byDate.get(key);
    if (list) {
      list.push(row);
    } else {
      byDate.set(key, [row]);
    }
  }
  const extra = [...byDate.keys()]
    .filter((key) => key !== UNASSIGNED_SHOW_KEY && !upcomingDates.includes(key))
    .sort();
  const keys = [
    ...upcomingDates,
    ...extra,
    ...(byDate.has(UNASSIGNED_SHOW_KEY) ? [UNASSIGNED_SHOW_KEY] : [])
  ];
  return keys.map((date) => ({ date, rows: byDate.get(date) ?? [] }));
}

/** Past air dates that still have queued packages, newest first. */
export function groupPastQueueSections<T extends { queuedForShowDate: string | null }>(
  rows: T[],
  upcomingDates: string[],
  today?: string
): Array<{ date: string; rows: T[] }> {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    const date = row.queuedForShowDate;
    if (!isPastQueuedShowDate(date, upcomingDates, today) || !date) continue;
    const list = byDate.get(date);
    if (list) {
      list.push(row);
    } else {
      byDate.set(date, [row]);
    }
  }
  return [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((date) => ({ date, rows: byDate.get(date) ?? [] }));
}
