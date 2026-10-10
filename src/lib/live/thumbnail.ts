import { z } from "zod";
import type { ScoreboardState } from "@/src/lib/live/scoreboard";

export const THUMBNAIL_TEMPLATES = ["matchup", "event", "final"] as const;
export const THUMBNAIL_FORMATS = ["youtube", "post", "story"] as const;
export type ThumbnailTemplate = (typeof THUMBNAIL_TEMPLATES)[number];
export type ThumbnailFormat = (typeof THUMBNAIL_FORMATS)[number];

export const THUMBNAIL_SIZES: Record<ThumbnailFormat, { width: number; height: number; label: string }> = {
  youtube: { width: 1280, height: 720, label: "YouTube" },
  post: { width: 1080, height: 1350, label: "Instagram post" },
  story: { width: 1080, height: 1920, label: "Instagram story" }
};

const MAX_FINAL_SCORE = 999;
const finalScoreSchema = z.coerce.number().int().min(0).max(MAX_FINAL_SCORE).default(0);

export const thumbnailQuerySchema = z.object({
  template: z.enum(THUMBNAIL_TEMPLATES).default("matchup"),
  format: z.enum(THUMBNAIL_FORMATS).default("youtube"),
  home: z.string().trim().max(18).default("Paly"),
  away: z.string().trim().max(18).default(""),
  line: z.string().trim().max(40).default(""),
  homeScore: finalScoreSchema,
  awayScore: finalScoreSchema,
  title: z.string().trim().max(60).default(""),
  location: z.string().trim().max(30).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  download: z.enum(["1"]).optional()
});

export type ThumbnailQuery = z.infer<typeof thumbnailQuerySchema>;

const VERSUS = /\s+(?:vs\.?|v\.?|versus|@)\s+/i;

/** "Varsity Boys Basketball vs. Gunn" → line "Varsity Boys Basketball", home "Paly", away "Gunn". */
export function parseEventTitle(title: string) {
  const [left, ...rest] = title.split(VERSUS);
  if (!rest.length) return { isMatchup: false, home: "Paly", away: "", line: "" };
  const away = rest.join(" vs. ").trim();
  const leftTrimmed = left.trim();
  const leftIsTeam = /^(paly|palo alto)$/i.test(leftTrimmed);
  return {
    isMatchup: true,
    home: leftIsTeam ? leftTrimmed : "Paly",
    away,
    line: leftIsTeam ? "" : leftTrimmed
  };
}

/** Score inputs a final thumbnail starts with: sets won in volleyball, points in every other sport. */
export function finalScoreInputs(scoreboard: Pick<ScoreboardState, "sport" | "teams">) {
  const [home, away] = scoreboard.teams.map((team) => String(scoreboard.sport === "volleyball" ? team.sets : team.score));
  return { homeScore: home, awayScore: away };
}

/** Date and time inputs (YYYY-MM-DD, HH:MM) for an instant, in Pacific time. */
export function pacificDateTimeInputs(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

export function formatThumbnailTime(time?: string) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatThumbnailDate(date?: string) {
  if (!date) return { short: "", long: "", monthDay: "" };
  const value = new Date(`${date}T12:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) => value.toLocaleDateString("en-US", { timeZone: "UTC", ...options });
  return {
    short: format({ weekday: "short" }),
    long: format({ weekday: "long" }),
    monthDay: format({ month: "short", day: "numeric" })
  };
}

/** Largest font size (step 2) whose estimated width fits; Lexend SemiBold averages about 0.62em per character. */
export function fitFontSize(text: string, maxWidth: number, maxSize: number, minSize: number, ratio = 0.62) {
  const length = Math.max(1, text.length);
  const size = Math.floor(maxWidth / (length * ratio) / 2) * 2;
  return Math.max(minSize, Math.min(maxSize, size));
}

/** Largest font size (step 4) at which the text wraps into at most `maxLines` lines of `width`. */
export function fitWrappedFontSize(text: string, width: number, maxLines: number, maxSize: number, minSize: number, ratio = 0.62) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = maxSize; size > minSize; size -= 4) {
    const perLine = Math.floor(width / (size * ratio));
    if (words.some((word) => word.length > perLine)) continue;
    let lines = 1;
    let used = 0;
    for (const word of words) {
      const next = used === 0 ? word.length : used + 1 + word.length;
      if (next > perLine) {
        lines += 1;
        used = word.length;
      } else {
        used = next;
      }
    }
    if (lines <= maxLines) return size;
  }
  return minSize;
}

export function thumbnailFileName(query: Pick<ThumbnailQuery, "template" | "format" | "home" | "away" | "title" | "date">) {
  const matchup = `${query.home}-vs-${query.away}`;
  const base = query.template === "matchup" ? matchup : query.template === "final" ? `${matchup}-final` : query.title || "livestream";
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "livestream";
  return `${slug}${query.date ? `-${query.date}` : ""}-${query.format}.png`;
}
