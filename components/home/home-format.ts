import type { DashboardStage } from "@/src/server/dashboard-data";
import { relativeDaysLabel } from "@/components/kit/tone";
import { pacificDateKey } from "@/src/lib/deadlines";

/** Pure helpers for Home (/dashboard). Client-safe: only type imports from the server loaders. */

export type SortValue = "name" | "recent" | "size";
export type ViewValue = "grid" | "list";
export type DueTone = "neutral" | "warning" | "danger";

export const SORT_OPTIONS: ReadonlyArray<{ value: SortValue; label: string }> = [
  { value: "name", label: "Name" },
  { value: "recent", label: "Recent" },
  { value: "size", label: "Size" }
];

export function normalizeSort(value: string | undefined): SortValue {
  return value === "recent" || value === "size" ? value : "name";
}

export function normalizeView(value: string | undefined): ViewValue {
  return value === "list" ? "list" : "grid";
}

/** /dashboard?workspaceId=…&sort=…&view=… (the URL contract the shell also reads). */
export function dashboardHref({ workspaceId, sort, view }: { workspaceId: string; sort: SortValue; view: ViewValue }) {
  const params = new URLSearchParams({ workspaceId, sort, view });
  return `/dashboard?${params.toString()}`;
}

const SHORT_STAGE_LABEL: Record<DashboardStage["key"], string> = {
  proofOfContact: "Brainstorming",
  aRollBRoll: "A-roll / B-roll",
  initialCut: "Initial Cut",
  finalCut: "Final Cut"
};

/** "Brainstorming & Proof of Contact" is too long for buttons and the 4-column strip. */
export function shortStageLabel(key: DashboardStage["key"]) {
  return SHORT_STAGE_LABEL[key];
}

/** Whole days from today (Pacific) to a stored due day; same math as formatStageDueLabel. */
export function stageDueDays(dueDate: string | null, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const todayUtc = Date.parse(`${pacificDateKey(now)}T00:00:00.000Z`);
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((dueUtc - todayUtc) / 86_400_000);
}

/** Past due is danger, today through two days out is warning, later is neutral. */
export function stageDueTone(days: number | null): DueTone {
  if (days === null) return "neutral";
  if (days < 0) return "danger";
  if (days <= 2) return "warning";
  return "neutral";
}

/** Extension days left: warning at 0, danger when overdrawn, otherwise no tone. */
export function extensionsTone(remaining: number): DueTone | undefined {
  if (remaining < 0) return "danger";
  if (remaining === 0) return "warning";
  return undefined;
}

export function plural(count: number, word: string, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

export function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** "Oct 16": a stored due day (a UTC date) as formatStageDueLabel prints it, without the countdown. */
export function formatShortDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * "Due Oct 16 · in 2d" ("· Today", "· 2d ago"): the due tag in the header and the producer's
 * strip, in the kit's countdown words, so every countdown on Home reads the same.
 */
export function formatDueTagLabel(dueDate: string | null, now: Date = new Date()): string | null {
  const date = formatShortDueDate(dueDate);
  const days = stageDueDays(dueDate, now);
  if (date === null || days === null) return null;
  return `Due ${date} · ${relativeDaysLabel(days)}`;
}

/** "Abby, Otto, Sage · Producer: Rowan": the whole roster, then the producer (or that none is set). */
export function packagePeopleLine({ memberNames, producerName }: { memberNames: string[]; producerName: string | null }) {
  return [memberNames.filter(Boolean).join(", "), producerName ? `Producer: ${producerName}` : "No producer assigned"]
    .filter(Boolean)
    .join(" · ");
}

export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 120;

/** Same bounds as POST /api/projects (zod: trimmed, 2–120). The server stays the authority. */
export function isValidProjectName(name: string) {
  const length = name.trim().length;
  return length >= PROJECT_NAME_MIN && length <= PROJECT_NAME_MAX;
}

/** POST /api/projects failures by status (400 is a validation error, 403 a role check). */
export function createProjectErrorMessage(status: number) {
  if (status === 400) return `Use ${PROJECT_NAME_MIN}–${PROJECT_NAME_MAX} characters.`;
  if (status === 403) return "Only workspace owners and editors can add projects.";
  return "Couldn't create the project. Try again.";
}
