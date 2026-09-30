/**
 * Students may not keep the same groupmates from one cycle to the next.
 * Returns each current member who already shared a group with another
 * current member last cycle.
 */
export type ConsecutiveOverlap = {
  userId: string;
  withUserIds: string[];
};

export function consecutiveGroupmateOverlaps(
  memberUserIds: string[],
  previousTeammatesByUser: Record<string, string[]>
): ConsecutiveOverlap[] {
  const current = new Set(memberUserIds);
  const overlaps: ConsecutiveOverlap[] = [];

  for (const userId of memberUserIds) {
    const withUserIds = [...new Set(previousTeammatesByUser[userId] ?? [])]
      .filter((otherId) => otherId !== userId && current.has(otherId))
      .sort();

    if (withUserIds.length > 0) {
      overlaps.push({ userId, withUserIds });
    }
  }

  return overlaps;
}

/** Current members that `userId` shared a group with last cycle, in member order. */
export function lastCycleGroupmatesAmong(
  userId: string,
  memberUserIds: string[],
  previousTeammatesByUser: Record<string, string[]>
): string[] {
  const previous = new Set(previousTeammatesByUser[userId] ?? []);
  return memberUserIds.filter((otherId) => otherId !== userId && previous.has(otherId));
}

export function previousTeammatesByUserFromGroups(groups: string[][]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const group of groups) {
    for (const userId of group) {
      const others = group.filter((otherId) => otherId !== userId);
      const existing = map[userId] ?? [];
      map[userId] = [...new Set([...existing, ...others])];
    }
  }

  return map;
}
