import { HARVEST_KINDS, type HarvestKind } from "@/src/lib/thanksgiving-board";

/**
 * Cheat checks for the Thanksgiving leaderboard. The game runs in the browser, so the server
 * can't watch it; instead every catch is judged against what a person clicking can actually do
 * (src/server/thanksgiving-scores.ts runs this on every batch and logs each verdict):
 *
 * - Reaction time: a catch needs a visitor that has been on screen for a moment. Scripts that
 *   read the page and click at once, or post catches with no visitor at all, fail this.
 * - Click speed: nobody clicks twice within 90 ms.
 * - Rates: per kind, per rolling minute, hour and day, set above what the visitor schedule can
 *   give a lucky, attentive person with a couple of windows open.
 * - Clock: catches far in the future or older than half an hour don't count.
 * - Automation: a browser driven by WebDriver (Playwright, Selenium, Puppeteer) doesn't count.
 *
 * Rejected catches are kept with their reason. Going over a rate limit is a cooldown, not a ban:
 * those catches don't count until the window rolls over. Enough bot-like rejections, or click
 * timing more regular than a person manages, flags the account: it leaves the board and can't
 * win the contest until an exec clears it.
 */

export type CatchInput = {
  kind: HarvestKind;
  /** When it was caught, on the browser's clock (ms). */
  at: number;
  /** How long the visitor had been on screen when it was caught (ms); null for giant turkeys. */
  age: number | null;
};

export type RejectReason =
  | "automation"
  | "inhuman-reaction"
  | "no-reaction-time"
  | "too-fast"
  | "rate-limit"
  | "clock"
  | "outdated-page"
  | "duplicate";

export type CatchVerdict = {
  kind: HarvestKind;
  caughtAt: Date;
  reactionMs: number | null;
  accepted: boolean;
  reason: RejectReason | null;
};

type KindRule = {
  /** Least time on screen before a catch (null: not a click, no reaction time). */
  minAgeMs: number | null;
  perMinute: number;
  perHour: number;
  perDay: number;
};

/**
 * One visitor every 9–18 s per open window: leaves (40%, 3–6 at a time), pies (25%, at most 3 on
 * screen), a strutting turkey (20%, five clicks to pardon), a wishbone (3%), and a giant turkey
 * every 30–60 minutes. The caps sit well above that.
 */
export const CATCH_RULES: Record<HarvestKind, KindRule> = {
  leaves: { minAgeMs: 200, perMinute: 40, perHour: 700, perDay: 2_500 },
  pies: { minAgeMs: 200, perMinute: 8, perHour: 120, perDay: 500 },
  wishbones: { minAgeMs: 200, perMinute: 3, perHour: 15, perDay: 60 },
  // Five clicks on a turkey that walks in from the edge.
  pardons: { minAgeMs: 600, perMinute: 4, perHour: 80, perDay: 300 },
  giantTurkeys: { minAgeMs: null, perMinute: 1, perHour: 4, perDay: 30 }
};

export const MIN_CLICK_GAP_MS = 90;
export const MAX_CATCHES_PER_BATCH = 200;
const FUTURE_SLACK_MS = 10_000;
const MAX_DELAY_MS = 30 * 60_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A visitor can't stay catchable longer than this, so a longer "age" is made up. */
const MAX_AGE_MS = 10 * MINUTE_MS;

export type RecentCatches = {
  /** Times (ms) of accepted clicks in the last day, oldest first, for the click-speed check. */
  clickTimes: number[];
  /** Times (ms) of accepted catches of each kind in the last day, oldest first, for the rates. */
  kindTimes: Record<HarvestKind, number[]>;
  /** Catches already logged (accepted or not) in the last RECENT_LOG_MS, to spot a batch sent twice. */
  logged: LoggedCatch[];
};

export type LoggedCatch = { kind: HarvestKind; at: number; reactionMs: number | null };

/**
 * A browser re-sends a batch when it thinks the first send failed, sometimes after the server
 * saved it. Each send has its own clock offset, so the copy lands up to a second or so off the
 * original, with the same kind and reaction time. Two real catches matching to the millisecond
 * this close together are rare enough to count the second as the copy.
 */
export const RESEND_WINDOW_MS = 5_000;
/** How far back logged catches are kept for the re-send check (a catch older than this is "clock"). */
export const RECENT_LOG_MS = MAX_DELAY_MS + RESEND_WINDOW_MS;

export function emptyRecent(): RecentCatches {
  return {
    clickTimes: [],
    kindTimes: Object.fromEntries(HARVEST_KINDS.map((kind) => [kind, []])) as unknown as Record<HarvestKind, number[]>,
    logged: []
  };
}

function isResend(seen: readonly LoggedCatch[], kind: HarvestKind, at: number, reactionMs: number | null) {
  return seen.some(
    (item) => item.kind === kind && item.reactionMs === reactionMs && Math.abs(item.at - at) <= RESEND_WINDOW_MS
  );
}

function countSince(times: readonly number[], since: number) {
  return times.filter((time) => time > since).length;
}

function overRate(kind: HarvestKind, times: readonly number[], at: number) {
  const rule = CATCH_RULES[kind];
  return (
    countSince(times, at - MINUTE_MS) >= rule.perMinute ||
    countSince(times, at - HOUR_MS) >= rule.perHour ||
    countSince(times, at - DAY_MS) >= rule.perDay
  );
}

/**
 * Judges one batch, in the order the catches happened. `offsetMs` moves browser times onto the
 * server's clock (server time when it arrived minus the browser's time when it was sent).
 */
export function judgeCatches({
  catches,
  now,
  offsetMs,
  recent,
  automation
}: {
  catches: readonly CatchInput[];
  now: number;
  offsetMs: number;
  recent: RecentCatches;
  automation: boolean;
}): CatchVerdict[] {
  const clicks = [...recent.clickTimes];
  const byKind = Object.fromEntries(HARVEST_KINDS.map((kind) => [kind, [...recent.kindTimes[kind]]])) as Record<
    HarvestKind,
    number[]
  >;
  const seen = [...recent.logged];
  const ordered = [...catches].sort((a, b) => a.at - b.at);

  return ordered.map((input) => {
    const at = Math.round(input.at + offsetMs);
    const rule = CATCH_RULES[input.kind];
    const reactionMs = rule.minAgeMs === null || input.age === null ? null : Math.round(input.age);
    const verdict = (reason: RejectReason | null): CatchVerdict => ({
      kind: input.kind,
      caughtAt: new Date(Math.min(Math.max(at, now - MAX_DELAY_MS), now)),
      reactionMs,
      accepted: reason === null,
      reason
    });

    if (automation) return verdict("automation");
    if (!Number.isFinite(at) || at > now + FUTURE_SLACK_MS || at < now - MAX_DELAY_MS) return verdict("clock");
    // Checked before click speed: a re-sent copy lands right next to its original.
    if (isResend(seen, input.kind, at, reactionMs)) return verdict("duplicate");
    seen.push({ kind: input.kind, at, reactionMs });
    if (rule.minAgeMs !== null) {
      if (reactionMs === null || !Number.isFinite(reactionMs) || reactionMs > MAX_AGE_MS) return verdict("no-reaction-time");
      if (reactionMs < rule.minAgeMs) return verdict("inhuman-reaction");
      const last = clicks.at(-1);
      if (last !== undefined && at - last < MIN_CLICK_GAP_MS) return verdict("too-fast");
    }
    if (overRate(input.kind, byKind[input.kind], at)) return verdict("rate-limit");

    byKind[input.kind].push(at);
    if (rule.minAgeMs !== null) clicks.push(at);
    return verdict(null);
  });
}

/** Rejections that only a script produces (clock trouble, old pages and re-sends are honest mistakes). */
export const BOT_REASONS: readonly RejectReason[] = ["automation", "inhuman-reaction", "no-reaction-time", "too-fast"];
/** Bot-like rejections since the last review that flag an account. */
export const FLAG_AFTER_BOT_REJECTIONS = 5;
/** Click timing this even (coefficient of variation), over this many gaps, is a machine. */
export const REGULAR_TIMING_CV = 0.2;
export const REGULAR_TIMING_SAMPLES = 30;
/**
 * A leaf takes 9–14 s to fall and is only fully on screen about half a second in. Catching nine
 * in ten of the last 25+ within 1.5 s of appearing (each at a random spot along the top edge)
 * is a script watching for new leaves, not a person.
 */
export const LEAF_SNIPE_MS = 1_500;
export const LEAF_SNIPE_SAMPLES = 25;
/** Gaps longer than this are breaks, not play, and don't count toward the timing check. */
const PLAY_GAP_MS = 30_000;

function coefficientOfVariation(values: readonly number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Why an account should be flagged, or null. `clickTimes` and `reactions` are its latest accepted
 * clicks (oldest first) and their reaction times; the counts are rejections since the last review.
 */
export function flagReason({
  botRejections,
  clickTimes,
  reactions,
  leafReactions = []
}: {
  botRejections: number;
  clickTimes: readonly number[];
  reactions: readonly number[];
  /** Reaction times of the latest accepted leaf catches. */
  leafReactions?: readonly number[];
}): string | null {
  if (botRejections >= FLAG_AFTER_BOT_REJECTIONS) return `${botRejections} catches no person could make`;
  const gaps = clickTimes
    .slice(1)
    .map((time, index) => time - clickTimes[index])
    .filter((gap) => gap > 0 && gap < PLAY_GAP_MS);
  if (gaps.length >= REGULAR_TIMING_SAMPLES && coefficientOfVariation(gaps) < REGULAR_TIMING_CV) {
    return "Clicks evenly spaced, like a script";
  }
  if (reactions.length >= REGULAR_TIMING_SAMPLES && coefficientOfVariation(reactions) < REGULAR_TIMING_CV) {
    return "Reaction times all the same, like a script";
  }
  if (leafReactions.length >= LEAF_SNIPE_SAMPLES) {
    const sorted = [...leafReactions].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    if (p90 < LEAF_SNIPE_MS) return "Every leaf caught the moment it appeared, like a script";
  }
  return null;
}
