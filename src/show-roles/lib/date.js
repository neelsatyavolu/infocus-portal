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

// Shows run Wednesday + Friday (2026–27). Offsets jump to the next show day
// (on a show day, the *other* show of the pair / next week).
const SHOW_DAY_OFFSETS = {
  0: 3, // Sun → Wed
  1: 2, // Mon → Wed
  2: 1, // Tue → Wed
  3: 2, // Wed → Fri
  4: 1, // Thu → Fri
  5: 5, // Fri → next Wed
  6: 4 // Sat → Wed
};

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

export function isShowDay(dateOrString) {
  const date = typeof dateOrString === "string" ? parseDate(dateOrString) : dateOrString;
  const dow = date.getDay();
  if (dow !== 3 && dow !== 5) return false;
  return formatDate(date) >= FIRST_SHOW_DATE;
}

export function getShowType(dateOrString) {
  const date = typeof dateOrString === "string" ? parseDate(dateOrString) : dateOrString;
  const dow = date.getDay();
  if (dow === 3) return "Wednesday";
  if (dow === 5) return "Friday";
  return null;
}

export function getCurrentShowDate(from = new Date()) {
  const source = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const offset = SHOW_DAY_OFFSETS[source.getDay()] ?? 2;
  source.setDate(source.getDate() + offset);
  if (formatDate(source) < FIRST_SHOW_DATE) {
    return parseDate(FIRST_SHOW_DATE);
  }
  return source;
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
