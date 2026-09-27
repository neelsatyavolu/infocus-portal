/** Pure helpers for the Instagram Post Maker's Show template: one show as a set of story slides. */
import { apDate } from "@/src/lib/story-maker";

export type ShowStoryPackage = { id: string; title: string; reporters: string[] };

/** What the Show template loads for one show date (GET /api/managers/social-media/show). */
export type ShowStoryData = {
  /** YYYY-MM-DD */
  date: string;
  anchors: string[];
  /** Announcement copy as it aired (teleprompter A2), or as scheduled when there's no script. */
  announcements: string[];
  /** "teleprompter": the show's A2 script; "submissions": what was scheduled for that day. */
  announcementSource: "teleprompter" | "submissions";
  packages: ShowStoryPackage[];
};
export type ShowStoryResponse = ShowStoryData & { shows: string[] };

/** Gemini summarizes at most this many announcements, each at most this long. */
export const MAX_SUMMARY_ANNOUNCEMENTS = 8;
export const MAX_ANNOUNCEMENT_CHARS = 4000;
/** How many recent shows the date picker offers. */
export const RECENT_SHOW_COUNT = 8;

export type ShowSlide = { kind: "recap" } | { kind: "announcements" } | { kind: "package"; index: number };

/** Recap first, then announcements, then one slide per package. */
export function showSlides(packageCount: number): ShowSlide[] {
  return [
    { kind: "recap" },
    { kind: "announcements" },
    ...Array.from({ length: packageCount }, (_, index) => ({ kind: "package" as const, index }))
  ];
}

export function showSlideName(slide: ShowSlide, packageCount: number): string {
  if (slide.kind === "recap") return "Recap";
  if (slide.kind === "announcements") return "Announcements";
  return packageCount > 1 ? `Package ${slide.index + 1}` : "Package";
}

/** "Abby", "Abby and Otto", "Abby, Otto and Sage" (AP style: no serial comma). */
export function joinNames(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 2) return clean.join(" and ");
  return `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`;
}

export function packageByline(reporters: string[]): string {
  const names = joinNames(reporters);
  return names ? `By ${names}` : "";
}

/** A real calendar day in YYYY-MM-DD form (rejects 2026-13-01 and 2026-02-30). */
export function isShowDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Local noon keeps the calendar day the same in every time zone. */
export function showDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function showApDate(dateKey: string): string {
  return apDate(showDateFromKey(dateKey));
}

/** e.g. infocus-story-show-2026-09-25-2-announcements.png */
export function showSlideFileName(dateKey: string, slide: ShowSlide, position: number): string {
  const part = slide.kind === "package" ? `package-${slide.index + 1}` : slide.kind;
  return `infocus-story-show-${dateKey}-${position + 1}-${part}.png`;
}
