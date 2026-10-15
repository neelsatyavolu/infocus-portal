import { z } from "zod";
import {
  defaultScoreboard,
  FOOTBALL_TIMEOUTS_PER_HALF,
  MAX_CLOCK_MS,
  MAX_PERIOD,
  MAX_SCORE,
  MAX_TAGS,
  MAX_TEAM_NAME,
  SPORTS,
  type ScoreboardState
} from "@/src/lib/live/scoreboard";

// Zod schemas live apart from scoreboard so the live dashboard can apply
// actions without bundling zod. The server parses with these.

const teamSchema = z.object({
  name: z.string().max(MAX_TEAM_NAME),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  score: z.number().int().min(0).max(MAX_SCORE),
  bonus: z.boolean(),
  timeouts: z.number().int().min(0).max(FOOTBALL_TIMEOUTS_PER_HALF),
  sets: z.number().int().min(0).max(5)
});

const clockSchema = z.object({
  direction: z.enum(["down", "up"]),
  /** Clock value when it last stopped (or when it started running). */
  ms: z.number().min(0).max(MAX_CLOCK_MS),
  /** What Reset goes back to for a countdown in "other" sports (the last value set). */
  resetMs: z.number().min(0).max(MAX_CLOCK_MS),
  running: z.boolean(),
  /** Server time the clock started running; null while stopped. */
  startedAt: z.number().nullable()
});

const tagSchema = z.object({
  id: z.string().max(40),
  kind: z.enum(["timeout", "flag", "set", "touchdown"]),
  text: z.string().max(60),
  until: z.number(),
  /** Which team a touchdown (for its color chip) or timeout (so a second tap ends it) belongs to. */
  team: z.union([z.literal(0), z.literal(1)]).optional()
});

export const scoreboardSchema = z.object({
  version: z.literal(1),
  sport: z.enum(SPORTS),
  position: z.enum(["bottom", "top"]),
  teams: z.tuple([teamSchema, teamSchema]),
  period: z.number().int().min(1).max(MAX_PERIOD),
  /** Free-text period for "other" sports, e.g. "2nd half". */
  periodLabel: z.string().max(24),
  showClock: z.boolean(),
  clock: clockSchema,
  possession: z.union([z.literal(0), z.literal(1)]).nullable(),
  serve: z.union([z.literal(0), z.literal(1)]).nullable(),
  down: z.number().int().min(0).max(4),
  distance: z.string().max(6),
  set: z.number().int().min(1).max(9),
  setHistory: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(8),
  /** Cumulative score at the end of each finished period (basketball, football). */
  periodScores: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(20),
  /** One-line note on the tier for "other" sports. */
  note: z.string().max(60),
  /** Football touchdown animation. Defaults on, so boards saved before this field existed still parse. */
  celebrations: z.boolean().default(true),
  tags: z.array(tagSchema).max(MAX_TAGS)
});

/** Parses stored JSON, falling back to a fresh board if it is missing or from an older shape. */
export function parseScoreboard(value: unknown): ScoreboardState {
  const parsed = scoreboardSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultScoreboard();
}

const teamIndexSchema = z.union([z.literal(0), z.literal(1)]);

/** Operator actions. The dashboard sends these; the server applies them to the latest saved board. */
export const scoreboardActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("score"), team: teamIndexSchema, delta: z.number().int().min(-10).max(10) }),
  z.object({ type: z.literal("scoreSet"), team: teamIndexSchema, score: z.number().int().min(0).max(MAX_SCORE) }),
  z.object({ type: z.literal("timeoutAdjust"), team: teamIndexSchema, delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ type: z.literal("timeout"), team: teamIndexSchema }),
  z.object({ type: z.literal("bonus"), team: teamIndexSchema }),
  z.object({ type: z.literal("serve"), team: teamIndexSchema }),
  z.object({ type: z.literal("possession"), team: teamIndexSchema }),
  z.object({ type: z.literal("team"), team: teamIndexSchema, name: z.string().max(40).optional(), color: z.string().max(7).optional() }),
  z.object({ type: z.literal("clockToggle") }),
  z.object({ type: z.literal("clockReset") }),
  z.object({ type: z.literal("showClock"), show: z.boolean() }),
  z.object({ type: z.literal("clockDirection"), direction: z.enum(["down", "up"]) }),
  z.object({ type: z.literal("clockSet"), ms: z.number().min(0).max(MAX_CLOCK_MS) }),
  z.object({ type: z.literal("clockAdjust"), deltaMs: z.number().int().min(-60 * 60_000).max(60 * 60_000) }),
  z.object({ type: z.literal("periodLength"), minutes: z.number().min(0).max(120) }),
  z.object({ type: z.literal("nextPeriod") }),
  z.object({ type: z.literal("previousPeriod") }),
  z.object({ type: z.literal("down"), down: z.number().int().min(0).max(4) }),
  z.object({ type: z.literal("distance"), value: z.string().max(12) }),
  z.object({ type: z.literal("flag") }),
  z.object({ type: z.literal("endSet") }),
  z.object({ type: z.literal("periodLabel"), value: z.string().max(48) }),
  z.object({ type: z.literal("note"), value: z.string().max(120) }),
  z.object({ type: z.literal("position"), position: z.enum(["bottom", "top"]) }),
  z.object({ type: z.literal("celebrations"), on: z.boolean() }),
  z.object({ type: z.literal("sport"), sport: z.enum(SPORTS) }),
  z.object({ type: z.literal("reset") })
]);
