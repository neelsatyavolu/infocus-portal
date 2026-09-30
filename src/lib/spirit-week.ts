/** Spirit Week 2026 (Mon Oct 5 – Fri Oct 9): each day's dress-up theme. */
export const SPIRIT_WEEK_DAYS = [
  { date: "2026-10-05", theme: "Class themes" },
  { date: "2026-10-06", theme: "Salad dressing" },
  { date: "2026-10-07", theme: "Green & white/Paly spirit" },
  { date: "2026-10-08", theme: "Generations" },
  { date: "2026-10-09", theme: "Class colors" }
] as const;

/** The day's theme, or null outside Spirit Week. Spirit Week days also get Filmers/Editors. */
export function spiritWeekTheme(dateKey: string): string | null {
  return SPIRIT_WEEK_DAYS.find((day) => day.date === dateKey)?.theme ?? null;
}

/**
 * The A3 toss for a Spirit Week recap show, from its calendar label
 * ("Spirit Week Day 2 Recap"). Null for any other show.
 */
export function spiritWeekRecapToss(label: string): string | null {
  const trimmed = label.trim();
  const match = /^spirit week day (\d+) recap$/i.exec(trimmed);
  const day = match ? SPIRIT_WEEK_DAYS[Number(match[1]) - 1] : undefined;
  if (match && day) {
    return `Yesterday's theme was ${day.theme} - let's watch the InFocus Spirit Week Day ${match[1]} recap.`;
  }
  if (/spirit week/i.test(trimmed)) {
    return `Let's watch the InFocus ${trimmed}.`;
  }
  return null;
}
