import { z } from "zod";

/**
 * Live scoreboard state shared by the dashboard (writes) and the OBS overlay (reads).
 * All timestamps are server epoch milliseconds, so every screen agrees on the clock.
 */

export const SPORTS = ["basketball", "football", "volleyball", "other"] as const;
export type Sport = (typeof SPORTS)[number];

export const SPORT_LABELS: Record<Sport, string> = {
  basketball: "Basketball",
  football: "Football",
  volleyball: "Volleyball",
  other: "Other"
};

export const TIMEOUT_TAG_MS = 8_000;
/** A flag stays up until the operator picks it up; this only clears one somebody forgot. */
export const FLAG_TAG_MS = 2 * 60_000;
export const MAX_TEAM_NAME = 20;
export const SET_TAG_MS = 10_000;
/** Long enough that OBS (polling every second) still shows about four seconds of it. */
export const TOUCHDOWN_MS = 5_000;
export const FOOTBALL_TIMEOUTS_PER_HALF = 3;
const MAX_SCORE = 999;
const MAX_TAGS = 6;
const MAX_PERIOD = 20;
const MAX_CLOCK_MS = 24 * 60 * 60_000;

const PERIOD_MS: Record<"basketball" | "football", { regulation: number; overtime: number }> = {
  basketball: { regulation: 8 * 60_000, overtime: 4 * 60_000 },
  football: { regulation: 12 * 60_000, overtime: 0 }
};

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

export type ScoreboardState = z.infer<typeof scoreboardSchema>;
export type TeamIndex = 0 | 1;
export type TagKind = ScoreboardState["tags"][number]["kind"];

export const DEFAULT_TEAM_COLORS = ["#2BB36E", "#DCE2DE"] as const;

function regulationMs(sport: Sport) {
  return sport === "basketball" || sport === "football" ? PERIOD_MS[sport].regulation : 0;
}

export function defaultScoreboard(
  sport: Sport = "basketball",
  keep?: Pick<ScoreboardState, "teams" | "position"> & Partial<Pick<ScoreboardState, "celebrations">>
): ScoreboardState {
  const team = (index: TeamIndex) => ({
    name: keep?.teams[index].name ?? (index === 0 ? "PALY" : "AWAY"),
    color: keep?.teams[index].color ?? DEFAULT_TEAM_COLORS[index],
    score: 0,
    bonus: false,
    timeouts: FOOTBALL_TIMEOUTS_PER_HALF,
    sets: 0
  });
  return {
    version: 1,
    sport,
    position: keep?.position ?? "bottom",
    teams: [team(0), team(1)],
    period: 1,
    periodLabel: "1st half",
    showClock: sport !== "volleyball",
    clock: {
      direction: sport === "other" ? "up" : "down",
      ms: regulationMs(sport),
      resetMs: regulationMs(sport),
      running: false,
      startedAt: null
    },
    possession: sport === "football" ? 0 : null,
    serve: sport === "volleyball" ? 0 : null,
    down: 0,
    distance: "10",
    set: 1,
    setHistory: [],
    periodScores: [],
    note: "",
    celebrations: keep?.celebrations ?? true,
    tags: []
  };
}

/** Parses stored JSON, falling back to a fresh board if it is missing or from an older shape. */
export function parseScoreboard(value: unknown): ScoreboardState {
  const parsed = scoreboardSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultScoreboard();
}

export function clockMs(clock: ScoreboardState["clock"], now: number) {
  if (!clock.running || clock.startedAt === null) return clock.ms;
  const elapsed = Math.max(0, now - clock.startedAt);
  return clock.direction === "down" ? Math.max(0, clock.ms - elapsed) : Math.min(MAX_CLOCK_MS, clock.ms + elapsed);
}

/** Basketball shows tenths under a minute; everything else shows m:ss. */
export function formatClock(ms: number, sport: Sport) {
  if (sport === "basketball" && ms < 60_000) {
    return (Math.floor(ms / 100) / 10).toFixed(1);
  }
  const totalSeconds = sport === "other" ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function periodLabel(state: ScoreboardState) {
  if (state.sport === "volleyball") return `Set ${state.set}`;
  if (state.sport === "other") return state.periodLabel;
  if (state.period <= 4) return `Q${state.period}`;
  return state.period === 5 ? "OT" : `${state.period - 4}OT`;
}

export function ordinalDown(down: number) {
  return ["", "1st", "2nd", "3rd", "4th"][down] ?? `${down}th`;
}

export function activeTags(state: ScoreboardState, now: number, kind?: TagKind) {
  return state.tags.filter((tag) => tag.until > now && (!kind || tag.kind === kind));
}

export function timeoutShowing(state: ScoreboardState, team: TeamIndex, now: number) {
  return activeTags(state, now, "timeout").some((tag) => tag.team === team);
}

export function flagOn(state: ScoreboardState, now: number) {
  return activeTags(state, now, "flag").length > 0;
}

/** Football shows FLAG in the down tab while a flag tag is live. */
export function downText(state: ScoreboardState, now: number) {
  if (activeTags(state, now, "flag").length > 0) return "Flag";
  if (!state.down) return "";
  return `${ordinalDown(state.down)} & ${state.distance || "10"}`;
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

export type ScoreboardAction = z.infer<typeof scoreboardActionSchema>;

function withTag(state: ScoreboardState, kind: TagKind, text: string, durationMs: number, now: number, team?: TeamIndex) {
  const tag = { id: `${kind}-${now}`, kind, text, until: now + durationMs, ...(team === undefined ? {} : { team }) };
  const tags = state.tags
    .filter((existing) => existing.until > now && !(existing.kind === kind && existing.text === text))
    .concat(tag)
    .slice(-MAX_TAGS);
  return { ...state, tags };
}

function withoutTags(state: ScoreboardState, kind: TagKind): ScoreboardState {
  return state.tags.some((tag) => tag.kind === kind) ? { ...state, tags: state.tags.filter((tag) => tag.kind !== kind) } : state;
}

function withoutFlag(state: ScoreboardState): ScoreboardState {
  return state.tags.some((tag) => tag.kind === "flag") ? { ...state, tags: state.tags.filter((tag) => tag.kind !== "flag") } : state;
}

function updateTeam(
  state: ScoreboardState,
  index: TeamIndex,
  patch: Partial<ScoreboardState["teams"][number]>
): ScoreboardState["teams"] {
  return index === 0 ? [{ ...state.teams[0], ...patch }, state.teams[1]] : [state.teams[0], { ...state.teams[1], ...patch }];
}

function stoppedClock(ms: number, direction: "down" | "up", resetMs: number) {
  return { direction, ms: Math.min(MAX_CLOCK_MS, Math.max(0, ms)), resetMs, running: false, startedAt: null };
}

function nextPeriodClockMs(state: ScoreboardState, period: number) {
  if (state.sport !== "basketball" && state.sport !== "football") return 0;
  return period > 4 ? PERIOD_MS[state.sport].overtime : PERIOD_MS[state.sport].regulation;
}

/** Applies one operator action. Pure: returns a new state and never mutates the input. */
export function applyScoreboardAction(state: ScoreboardState, action: ScoreboardAction, now: number): ScoreboardState {
  const teamName = (index: TeamIndex) => state.teams[index].name || (index === 0 ? "HOME" : "AWAY");

  switch (action.type) {
    case "score": {
      const current = state.teams[action.team].score;
      const score = Math.min(MAX_SCORE, Math.max(0, current + action.delta));
      const scored = score > current;
      const next = {
        ...state,
        teams: updateTeam(state, action.team, { score }),
        serve: state.sport === "volleyball" && scored ? action.team : state.serve,
        down: state.sport === "football" && scored ? 0 : state.down
      };
      if (state.sport !== "football") return next;
      if (!scored) return withoutTags(next, "touchdown");
      const cleared = withoutFlag(next);
      return action.delta === 6 && state.celebrations
        ? withTag(cleared, "touchdown", teamName(action.team), TOUCHDOWN_MS, now, action.team)
        : cleared;
    }
    case "scoreSet":
      return { ...state, teams: updateTeam(state, action.team, { score: action.score }) };
    case "timeoutAdjust": {
      const timeouts = Math.min(FOOTBALL_TIMEOUTS_PER_HALF, Math.max(0, state.teams[action.team].timeouts + action.delta));
      return { ...state, teams: updateTeam(state, action.team, { timeouts }) };
    }
    case "timeout": {
      // A second tap while it's showing ends it early (and doesn't use another football timeout).
      if (timeoutShowing(state, action.team, now)) {
        return { ...state, tags: state.tags.filter((tag) => !(tag.kind === "timeout" && tag.team === action.team)) };
      }
      const text = `Timeout · ${teamName(action.team)}`;
      if (state.sport !== "football") return withTag(state, "timeout", text, TIMEOUT_TAG_MS, now, action.team);
      const left = state.teams[action.team].timeouts;
      if (left === 0) return state;
      return withTag(
        { ...state, teams: updateTeam(state, action.team, { timeouts: left - 1 }) },
        "timeout",
        text,
        TIMEOUT_TAG_MS,
        now,
        action.team
      );
    }
    case "bonus":
      return { ...state, teams: updateTeam(state, action.team, { bonus: !state.teams[action.team].bonus }) };
    case "serve":
      return { ...state, serve: action.team };
    case "possession":
      if (state.possession === action.team) return state;
      return { ...state, possession: action.team, down: 1, distance: "10" };
    case "team": {
      const patch: Partial<ScoreboardState["teams"][number]> = {};
      if (action.name !== undefined) patch.name = action.name.toUpperCase().slice(0, MAX_TEAM_NAME);
      if (action.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(action.color)) patch.color = action.color;
      return { ...state, teams: updateTeam(state, action.team, patch) };
    }
    case "clockToggle": {
      const ms = clockMs(state.clock, now);
      if (state.clock.running) return { ...state, clock: stoppedClock(ms, state.clock.direction, state.clock.resetMs) };
      if (state.clock.direction === "down" && ms <= 0) return state;
      return { ...state, clock: { ...state.clock, ms, running: true, startedAt: now } };
    }
    case "clockReset": {
      const { direction, resetMs } = state.clock;
      const ms = direction === "up" ? 0 : state.sport === "other" ? resetMs : nextPeriodClockMs(state, state.period);
      return { ...state, clock: stoppedClock(ms, direction, resetMs) };
    }
    case "clockSet": {
      const ms = Math.min(MAX_CLOCK_MS, Math.max(0, Math.round(action.ms)));
      if (!state.clock.running) return { ...state, clock: stoppedClock(ms, state.clock.direction, state.clock.resetMs) };
      return { ...state, clock: { ...state.clock, ms, startedAt: now } };
    }
    case "clockAdjust": {
      const ms = Math.min(MAX_CLOCK_MS, Math.max(0, clockMs(state.clock, now) + action.deltaMs));
      if (!state.clock.running) return { ...state, clock: stoppedClock(ms, state.clock.direction, state.clock.resetMs) };
      return { ...state, clock: { ...state.clock, ms, startedAt: now } };
    }
    case "periodLength": {
      const resetMs = Math.min(120, Math.max(0, Math.round(action.minutes))) * 60_000;
      if (state.clock.running) return { ...state, clock: { ...state.clock, resetMs } };
      return { ...state, clock: stoppedClock(state.clock.direction === "down" ? resetMs : state.clock.ms, state.clock.direction, resetMs) };
    }
    case "clockDirection":
      if (action.direction === state.clock.direction) return state;
      return { ...state, clock: stoppedClock(clockMs(state.clock, now), action.direction, state.clock.resetMs) };
    case "showClock":
      return { ...state, showClock: action.show };
    case "nextPeriod": {
      if (state.period >= MAX_PERIOD) return state;
      const period = state.period + 1;
      const periodScores = state.periodScores
        .concat([[state.teams[0].score, state.teams[1].score] as [number, number]])
        .slice(-20);
      let teams = state.teams;
      if (state.sport === "basketball") {
        teams = [{ ...teams[0], bonus: false }, { ...teams[1], bonus: false }];
      }
      if (state.sport === "football" && period === 3) {
        teams = [
          { ...teams[0], timeouts: FOOTBALL_TIMEOUTS_PER_HALF },
          { ...teams[1], timeouts: FOOTBALL_TIMEOUTS_PER_HALF }
        ];
      }
      return {
        ...state,
        period,
        periodScores,
        teams,
        down: state.sport === "football" ? 0 : state.down,
        clock: stoppedClock(nextPeriodClockMs(state, period), state.clock.direction, state.clock.resetMs)
      };
    }
    case "previousPeriod": {
      if (state.period <= 1) return state;
      return { ...state, period: state.period - 1, periodScores: state.periodScores.slice(0, -1) };
    }
    case "down":
      return withoutFlag({
        ...state,
        down: Math.min(4, Math.max(0, Math.round(action.down))),
        distance: action.down === 1 ? "10" : state.distance
      });
    case "distance":
      return { ...state, distance: action.value.toUpperCase().slice(0, 6) };
    case "flag":
      return flagOn(state, now) ? withoutFlag(state) : withTag(state, "flag", "Flag", FLAG_TAG_MS, now);
    case "endSet": {
      const [home, away] = state.teams;
      const winner: TeamIndex = home.score >= away.score ? 0 : 1;
      const high = Math.max(home.score, away.score);
      const low = Math.min(home.score, away.score);
      const next: ScoreboardState = {
        ...state,
        set: Math.min(9, state.set + 1),
        setHistory: state.setHistory.concat([[home.score, away.score] as [number, number]]).slice(-8),
        teams: [
          { ...home, score: 0, sets: Math.min(5, home.sets + (winner === 0 ? 1 : 0)) },
          { ...away, score: 0, sets: Math.min(5, away.sets + (winner === 1 ? 1 : 0)) }
        ]
      };
      return withTag(next, "set", `Set ${state.set} · ${teamName(winner)} ${high}–${low}`, SET_TAG_MS, now);
    }
    case "periodLabel":
      return { ...state, periodLabel: action.value.slice(0, 24) };
    case "note":
      return { ...state, note: action.value.slice(0, 60) };
    case "position":
      return { ...state, position: action.position };
    case "celebrations":
      return action.on ? { ...state, celebrations: true } : withoutTags({ ...state, celebrations: false }, "touchdown");
    case "sport":
      return defaultScoreboard(action.sport, state);
    case "reset":
      return defaultScoreboard(state.sport, state);
    default:
      return state;
  }
}

/** Drops expired tags so stored state stays small. */
/** Kept a few seconds past their end so an overlay that saw one late can finish its exit. */
const TAG_KEEP_MS = 3_000;

export function pruneTags(state: ScoreboardState, now: number): ScoreboardState {
  const tags = state.tags.filter((tag) => tag.until + TAG_KEEP_MS > now);
  return tags.length === state.tags.length ? state : { ...state, tags };
}

/**
 * Reads a typed clock value: "4:32", "12:00", "0:45.5", "45" (seconds), or "432" (4:32).
 * Returns milliseconds, or null if it isn't a time.
 */
export function parseClockInput(text: string): number | null {
  const value = text.trim();
  const colon = value.match(/^(\d{1,3}):([0-5]\d)(?:\.(\d))?$/);
  if (colon) return (Number(colon[1]) * 60 + Number(colon[2])) * 1000 + Number(colon[3] ?? 0) * 100;
  const seconds = value.match(/^(\d{1,2})(?:\.(\d))?$/);
  if (seconds) return Number(seconds[1]) * 1000 + Number(seconds[2] ?? 0) * 100;
  const digits = value.match(/^(\d{1,3})([0-5]\d)$/);
  if (digits) return (Number(digits[1]) * 60 + Number(digits[2])) * 1000;
  return null;
}
