import { resolveScheduleDay } from "@/src/lib/school-schedule";
import { FIRST_SHOW_DATE } from "@/src/lib/show-assignment";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ordinal(day) {
  if (day >= 11 && day <= 13) return "th";
  const mod = day % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

export function formatReadableDate(date) {
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}${ordinal(
    date.getDate(),
  )}, ${date.getFullYear()}`;
}

// Shows run Wednesday + Friday (2026–27), skipping no-school days.
export function isShowDay(dateOrString) {
  const date = typeof dateOrString === "string" ? parseDate(dateOrString) : dateOrString;
  return resolveScheduleDay(formatDate(date)).kind === "SHOW";
}

export function getShowType(dateOrString) {
  const date = typeof dateOrString === "string" ? parseDate(dateOrString) : dateOrString;
  const dow = date.getDay();
  if (dow === 3) return "Wednesday";
  if (dow === 5) return "Friday";
  return null;
}

// The show being prepped: the next show after today (on a show day, the following one).
export function getCurrentShowDate(from = new Date()) {
  return nextShowDate(from);
}

export function nextShowDate(from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 1; i <= 90; i += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + i);
    if (isShowDay(candidate)) return candidate;
  }
  return parseDate(FIRST_SHOW_DATE);
}
