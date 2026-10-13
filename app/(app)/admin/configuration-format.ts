const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

/** "2026-12-14" → "Mon, Dec 14, 2026". */
export function formatDay(dateKey: string) {
  return dayFormat.format(new Date(`${dateKey}T12:00:00Z`));
}

export const KIND_OPTIONS = [
  { value: "HOLIDAY", label: "No school (nothing scheduled, no points)" },
  { value: "NONE", label: "No PA or show (class can still meet)" },
  { value: "PA", label: "PA day" },
  { value: "SHOW", label: "Show day" }
] as const;

export type DayKind = (typeof KIND_OPTIONS)[number]["value"];

const KIND_LABELS: Record<string, string> = {
  HOLIDAY: "No school",
  NONE: "No PA or show",
  PA: "PA day",
  SHOW: "Show day"
};

const SOURCE_LABELS: Record<string, string> = {
  seed: "Built in",
  manual: "Set by hand",
  feed: "From Paly's calendar",
  config: "From the school year"
};

export function kindLabel(kind: string) {
  return KIND_LABELS[kind] ?? kind;
}

export function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source;
}
