/** Pure helpers for the Instagram Story Maker (Managers → Social media). */
import type { ThumbnailTemplate } from "@/src/lib/live/thumbnail";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
/** Instagram's own UI covers the top and bottom 250px of a story (DESIGN.md §12). */
export const STORY_SAFE_BAND = 250;
/** Text shrinks to 75% at most; past that we ask for shorter copy. */
export const MIN_FIT_SCALE = 0.75;
const FIT_STEP = 0.025;
/** Uploaded photos are downscaled so exports stay fast. */
export const MAX_PHOTO_SIDE = 2400;
export const MAX_POINTS = 5;

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** AP-style date, e.g. "Sept. 26, 2026". */
export function apDate(date: Date): string {
  return `${AP_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** One bullet per non-empty line, trimmed, at most five (the announcement rule). */
export function splitPoints(text: string, max = MAX_POINTS): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function downscaledSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Finds the largest text scale (1 down to MIN_FIT_SCALE) at which the content fits `maxHeight`.
 * `heightAt` renders at a scale and returns the measured content height.
 */
export function fitScale(heightAt: (scale: number) => number, maxHeight: number) {
  let scale = 1;
  while (heightAt(scale) > maxHeight + 1 && scale > MIN_FIT_SCALE) {
    scale = Math.max(MIN_FIT_SCALE, Math.round((scale - FIT_STEP) * 1000) / 1000);
  }
  return { scale, overflow: heightAt(scale) > maxHeight + 1 };
}

export function storyFileName(templateId: string, date: Date): string {
  const ymd = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  return `infocus-story-${templateId}-${ymd}.png`;
}

/** The Livestream template's fields: the livestream thumbnail's query, fixed to the story format. */
export type LivestreamFields = {
  template: ThumbnailTemplate;
  home: string;
  away: string;
  line: string;
  title: string;
  location: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
};

export function defaultLivestreamFields(today: Date): LivestreamFields {
  const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  return { template: "matchup", home: "Paly", away: "Gunn", line: "Varsity Football", title: "Livestream title", location: "Viking Stadium", date, time: "19:00" };
}

/** Same query the livestream dashboard's thumbnail panel sends to /api/live/thumbnail, as a story. */
export function livestreamThumbnailQuery(fields: LivestreamFields): string {
  const search = new URLSearchParams({ template: fields.template, format: "story" });
  const keys = fields.template === "matchup" ? (["home", "away", "line"] as const) : (["title"] as const);
  for (const key of [...keys, "location", "date", "time"] as const) {
    const value = fields[key].trim();
    if (value) search.set(key, value);
  }
  return search.toString();
}
