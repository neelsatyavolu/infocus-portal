import type { MeetingCutGroup } from "@/src/lib/meetings/types";

export type CutFilter = "all" | "initial" | "final";

/**
 * Watch-together picker list: groups whose topic or a member's name contains every word of the
 * query (case-insensitive), with at least one version of the chosen kind.
 */
export function filterCutGroups(groups: readonly MeetingCutGroup[], query: string, filter: CutFilter): MeetingCutGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return groups.filter((group) => {
    if (filter !== "all" && group[filter].length === 0) return false;
    const haystack = [group.topic, ...group.members].join(" ").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
