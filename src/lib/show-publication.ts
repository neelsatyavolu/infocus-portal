import { pacificDayStart } from "@/src/lib/class-board";

export const SHOW_PUBLISH_TIME = "08:30";
export const SHOW_THUMBNAIL_SECONDS = 17.5;
export const SHOW_TITLE_MAX = 100;
export const SHOW_DESCRIPTION_MAX = 5000;

const SEASON_PREFIX = "InFocus News | Season ";
const SEASON_PATTERN = /^InFocus News \| Season (\d+)$/;

const longDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  year: "numeric"
});

export function ordinalDay(day: number) {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

/** `InFocus News | Tuesday, September 22nd, 2026` */
export function showTitle(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const parts = longDate.formatToParts(new Date(Date.UTC(year, month - 1, day)));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `InFocus News | ${part("weekday")}, ${part("month")} ${ordinalDay(day)}, ${part("year")}`;
}

/** Pacific wall-clock `HH:MM` on a show date, as a UTC instant. */
export function showPublishAt(dateKey: string, time = SHOW_PUBLISH_TIME) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(pacificDayStart(dateKey).getTime() + (hours * 60 + minutes) * 60_000);
}

function joinNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function showDescription(input: { anchors: string[]; reporters: string[]; topics: string }) {
  const anchors = input.anchors.map((name) => name.trim()).filter(Boolean);
  const reporters = input.reporters.map((name) => name.trim()).filter(Boolean);
  const topics = input.topics.trim();
  const sentences: string[] = [];
  if (anchors.length) {
    sentences.push(anchors.length === 1
      ? `Anchor ${anchors[0]} shares campus announcements.`
      : `Anchors ${joinNames(anchors)} share campus announcements.`);
  }
  if (reporters.length) {
    const subject = reporters.length === 1
      ? `InFocus reporter ${reporters[0]} shares`
      : `InFocus reporters ${joinNames(reporters)} share`;
    sentences.push(`${subject} ${topics ? `news of ${topics}` : "the news"}.`);
  }
  return sentences.join(" ");
}

export function seasonPlaylistTitle(seasonNumber: number) {
  return `${SEASON_PREFIX}${seasonNumber}`;
}

export function parseSeasonNumber(title: string) {
  const match = SEASON_PATTERN.exec(title.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Highest season stays current until the first show upload dated in a new semester,
 * which starts the next season (unless someone already made it on YouTube).
 */
export function chooseSeason(input: {
  highestSeason: number | null;
  latest: { seasonNumber: number; semesterLabel: string } | null;
  semesterLabel: string;
}) {
  const { highestSeason, latest, semesterLabel } = input;
  if (highestSeason === null) return { seasonNumber: (latest?.seasonNumber ?? 0) + 1, create: true };
  if (latest && latest.semesterLabel !== semesterLabel && highestSeason <= latest.seasonNumber) {
    return { seasonNumber: highestSeason + 1, create: true };
  }
  return { seasonNumber: highestSeason, create: false };
}
