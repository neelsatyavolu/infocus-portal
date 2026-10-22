import { pacificDayStart } from "@/src/lib/class-board";

export const SHOW_PUBLISH_TIME = "08:30";
export const SHOW_THUMBNAIL_SECONDS = 16.5;
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

export type DescribedPackage = { reporters: string[]; toss: string | null };

/** A sentence that only hands off to the reporters ("InFocus reporters A and B have more."). */
const HANDOFF = /\bInFocus reporters?\b|\b(?:have|has) (?:more|the story|the details)\W*$/i;

/** The story in a package's toss, without the hand-off sentence that names the reporters. */
export function tossStory(toss: string) {
  return (toss.trim().match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !HANDOFF.test(sentence))
    .join(" ");
}

/**
 * The YouTube description: the anchors, then each package as its toss's story credited to its reporters
 * ("… Reported by A and B."). A package with no toss is credited in one line.
 */
export function showDescription(input: { anchors: string[]; packages: DescribedPackage[] }) {
  const anchors = input.anchors.map((name) => name.trim()).filter(Boolean);
  const sentences: string[] = [];
  if (anchors.length) {
    sentences.push(anchors.length === 1
      ? `Anchor ${anchors[0]} shares campus announcements.`
      : `Anchors ${joinNames(anchors)} share campus announcements.`);
  }
  for (const pkg of input.packages) {
    const reporters = pkg.reporters.map((name) => name.trim()).filter(Boolean);
    const story = pkg.toss ? tossStory(pkg.toss) : "";
    if (story) {
      sentences.push(reporters.length ? `${story} Reported by ${joinNames(reporters)}.` : story);
    } else if (reporters.length) {
      sentences.push(reporters.length === 1
        ? `InFocus reporter ${reporters[0]} shares a story.`
        : `InFocus reporters ${joinNames(reporters)} share a story.`);
    }
  }
  return sentences.join(" ");
}

/**
 * Master Calendar anchors are often first names or nicknames ("Sumedh"). Each becomes the one Portal user whose
 * nickname or first name it is, by full name; a name that matches nobody, or more than one person, stays as written.
 */
export function fullAnchorNames(anchors: string[], users: { name: string | null; nickname: string | null }[]) {
  const key = (value: string) => value.trim().toLowerCase();
  return anchors.map((anchor) => {
    const wanted = key(anchor);
    if (!wanted || wanted.includes(" ")) return anchor.trim();
    const matches = new Set(users
      .filter((user) => user.name?.trim() && (key(user.nickname ?? "") === wanted || key(user.name!.split(/\s+/)[0]) === wanted))
      .map((user) => user.name!.trim()));
    return matches.size === 1 ? [...matches][0] : anchor.trim();
  });
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
