/**
 * The edited show's chapters (client-safe): the editor sends `checks.chapters` as `[{ title, start }]`, seconds
 * into the render (Intro, Welcome, each announcement, each package, Sign-off, Outro). The review player lists them,
 * and the YouTube description carries them as timestamps, which YouTube turns into chapters.
 */

export type ShowChapter = { title: string; start: number };

const MAX_CHAPTERS = 40;

/** Chapters from an edit's checks, cleaned: strings and numbers only, in time order, the first at 0. */
export function chaptersOf(checks: unknown): ShowChapter[] {
  const raw = checks && typeof checks === "object" ? (checks as { chapters?: unknown }).chapters : null;
  if (!Array.isArray(raw)) return [];
  const chapters = raw
    .flatMap((entry): ShowChapter[] => {
      const title = typeof entry?.title === "string" ? entry.title.replace(/\s+/g, " ").trim().slice(0, 100) : "";
      const start = typeof entry?.start === "number" && Number.isFinite(entry.start) && entry.start >= 0 ? entry.start : null;
      return title && start !== null ? [{ title, start }] : [];
    })
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_CHAPTERS);
  return chapters.length > 0 ? [{ ...chapters[0], start: 0 }, ...chapters.slice(1)] : [];
}

/** `75.4` → "1:15"; an hour or more → "1:02:03". */
export function chapterTime(seconds: number) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** YouTube makes chapters only from at least 3 timestamps, the first 0:00, each at least 10 s long. */
const YOUTUBE_MIN_CHAPTER_S = 10;
const YOUTUBE_MIN_CHAPTERS = 3;

/** The chapters as YouTube needs them (short ones folded into the one before), or none when there aren't enough. */
export function youtubeChapters(chapters: ShowChapter[]): ShowChapter[] {
  const kept: ShowChapter[] = [];
  for (const chapter of chapters) {
    const previous = kept.at(-1);
    if (previous && chapter.start - previous.start < YOUTUBE_MIN_CHAPTER_S) continue;
    kept.push(chapter);
  }
  return kept.length >= YOUTUBE_MIN_CHAPTERS ? kept : [];
}

/** The description's chapter block: one "m:ss Title" line each. */
export function chapterLines(chapters: ShowChapter[]) {
  return youtubeChapters(chapters).map((chapter) => `${chapterTime(chapter.start)} ${chapter.title}`).join("\n");
}
