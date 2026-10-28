import { pacificWallTimeToUtc } from "@/src/lib/meetings/schedule";
import { youtubeWatchUrl } from "@/src/lib/youtube-publication";

/** Package stories go live on infocusnews.tv at 9:05 AM Pacific on the show date. */
export const STORY_PUBLISH_TIME = { hour: 9, minute: 5 } as const;

/** Categories the model never picks: archives, the unsorted bucket, editors' picks and livestreams. */
const UNPICKABLE_CATEGORY_SLUGS = new Set(["uncategorized", "archives", "featured-stories", "livestream"]);
export const FALLBACK_CATEGORY_SLUG = "news";

export type WordpressCategory = { id: number; name: string; slug: string; description?: string };

/** When the story goes live: 9:05 AM on the show date, or now if that time has already passed. */
export function storySchedule(showDate: string, now = new Date()) {
  const at = pacificWallTimeToUtc(showDate, STORY_PUBLISH_TIME.hour, STORY_PUBLISH_TIME.minute);
  // WordPress publishes a "future" post whose date is already past only when its cron next runs.
  return at.getTime() > now.getTime() + 60_000
    ? { status: "future" as const, at }
    : { status: "publish" as const, at: now };
}

/**
 * SNO Add Story fields: the Video/Embed box above the story, and the featured image
 * (the YouTube thumbnail) kept as the teaser image only ("Do Not Display on Story Page").
 * The box gets the video's URL, which SNO turns into a player: the API strips <iframe> embed code.
 */
export function storyMeta(videoId: string) {
  return { video: youtubeWatchUrl(videoId), videolocation: "Above Story", featureimage: "Do Not Display" };
}

/** YouTube's thumbnails, best first. maxresdefault is missing for some low-resolution uploads. */
export function youtubeThumbnailUrls(videoId: string) {
  youtubeWatchUrl(videoId);
  return ["maxresdefault", "hqdefault"].map((name) => `https://i.ytimg.com/vi/${videoId}/${name}.jpg`);
}

export function pickableCategories(categories: WordpressCategory[]) {
  return categories.filter((category) => !UNPICKABLE_CATEGORY_SLUGS.has(category.slug));
}

export function buildCategoryMessages(
  story: { title: string; topic: string; toss: string; showDate: string },
  categories: WordpressCategory[]
) {
  const list = categories.map((category) =>
    `- ${category.id}: ${decodeEntities(category.name)}${category.description ? ` (${category.description})` : ""}`).join("\n");
  const system = [
    "You file video news packages from InFocus, Palo Alto High School's student broadcast, into one category on its website.",
    "Pick exactly one category ID from the list.",
    "News: timely reporting on events, decisions, or issues. Features: profiles, culture, and human-interest stories.",
    "Commentary and Editorial are opinion pieces. Man on the Street is a montage of quick interviews with passersby.",
    "Pick an event category (for example a Spirit Week or convention category) only when the package is about that exact event in that year.",
    'Reply with JSON only: {"categoryId": <number>}.'
  ].join("\n");
  const about = [
    `Today: ${story.showDate}`,
    `Headline: ${story.title}`,
    ...(story.topic && story.topic !== story.title ? [`Topic: ${story.topic}`] : []),
    ...(story.toss ? [`Anchor introduction: ${story.toss}`] : [])
  ];
  return { system, user: `${about.join("\n")}\n\nCategories:\n${list}` };
}

/** The model's category, or null if it named one not on the list. */
export function parseCategoryReply(content: string, categories: WordpressCategory[]) {
  try {
    const id = Number((JSON.parse(content) as { categoryId?: unknown }).categoryId);
    return categories.some((category) => category.id === id) ? id : null;
  } catch {
    return null;
  }
}

/** A person in SNO's Writer's Name boxes: a `staff_name` term. */
export type WordpressStaffName = { id: number; name: string };

function personWords(name: string) {
  return decodeEntities(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z\s'-]/g, "").split(/\s+/).filter(Boolean);
}

/** The site's byline for a Portal name: the same full name, else the same first and last name (one side may add a middle name). */
export function findStaffName(name: string, staffNames: WordpressStaffName[]) {
  const words = personWords(name);
  if (!words.length) return null;
  const full = words.join(" ");
  const ends = `${words[0]} ${words.at(-1)}`;
  const candidates = staffNames.map((staff) => ({ staff, words: personWords(staff.name) }));
  return candidates.find((candidate) => candidate.words.join(" ") === full)?.staff
    ?? candidates.find((candidate) => candidate.words.length > 0 && `${candidate.words[0]} ${candidate.words.at(-1)}` === ends)?.staff
    ?? null;
}

export function samePerson(a: string, b: string) {
  return findStaffName(a, [{ id: 0, name: b }]) !== null;
}

const NAME_WORD = /^\p{Lu}[\p{L}'’.-]*$/u;

/**
 * The names after "InFocus reporter(s)" in the anchor toss, e.g. "InFocus reporters Abby Lane, Otto Reyes and Sage Ruiz
 * have more." Producers don't always put everyone who worked on a package on its roster, but the toss names them.
 */
export function tossReporterNames(toss: string) {
  const after = toss.match(/\bInFocus\s+reporters?\s+(.*)/isu)?.[1];
  if (!after) return [];
  const names: string[] = [];
  let current: string[] = [];
  const finish = () => {
    if (current.length >= 2) names.push(current.join(" "));
    current = [];
  };
  for (const raw of after.split(/\s+/)) {
    const word = raw.replace(/[,;:.!?]+$/, "");
    if (word === "and" || word === "&") {
      finish();
      continue;
    }
    if (!NAME_WORD.test(word)) break;
    current.push(word);
    if (raw !== word) {
      finish();
      if (/[;:.!?]$/.test(raw)) break;
    }
  }
  finish();
  return names;
}

function decodeEntities(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'").replace(/&quot;/g, '"');
}
