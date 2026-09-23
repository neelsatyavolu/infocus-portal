import { type ScheduleKind } from "@/src/lib/school-schedule";

/** Persisted hide token — kept for existing Monday rows. */
export const HIDE_IMAGE_TOKEN = "[[NO_MONDAY_IMAGE]]";

export const SCENIC_IMAGES = [
  "https://images.unsplash.com/photo-1439853949127-fa647821eba0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1431794062232-2a99a5431c6c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80"
] as const;

export const SHOW_TEMPLATE =
  "<p><strong>Anchors:</strong></p><p><br></p><p><strong>Package:</strong></p><p><br></p><p><br></p><p><strong>Show Director:</strong></p><p><br></p><p><strong>Show Manager:</strong></p><p><br></p>";

export const PA_TEMPLATE = "<p><strong>PA Announcers:</strong></p><p><br></p>";

export function isScenicImageDay(kind: ScheduleKind) {
  return kind === "NONE";
}

function hashDateKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function scenicImageForDate(dateKey: string) {
  return SCENIC_IMAGES[hashDateKey(dateKey) % SCENIC_IMAGES.length];
}

export function hasImageHidden(value: string) {
  return value.includes(HIDE_IMAGE_TOKEN);
}

export function stripImageToken(value: string) {
  return value.replace(HIDE_IMAGE_TOKEN, "").trim();
}

export function withImageHidden(value: string) {
  const clean = stripImageToken(value);
  return clean ? `${HIDE_IMAGE_TOKEN}${clean}` : HIDE_IMAGE_TOKEN;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function holidayTemplate(label?: string | null) {
  const text = label?.trim() || "No School";
  return `<p><strong>${escapeHtml(text)}</strong></p>`;
}

export function defaultTemplateForKind(kind: ScheduleKind, holidayLabel?: string | null) {
  if (kind === "SHOW") return SHOW_TEMPLATE;
  if (kind === "PA") return PA_TEMPLATE;
  if (kind === "HOLIDAY") return holidayTemplate(holidayLabel);
  return "";
}
