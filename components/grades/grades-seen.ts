import { shortDateFromKey } from "@/components/grades/grade-math";
import type { GradesMePayload } from "@/components/grades/grades-types";

/**
 * "What changed since your last visit" for the student Grades screen, from data the page already
 * loads. Each item has a signature; the browser remembers the signatures it last showed, and an
 * item whose signature differs is new. Pure functions, so the rules are easy to test.
 */

export type SeenItem = {
  key: string;
  signature: string;
  /** Wording when the item wasn't there last visit. */
  addedLabel: string;
  /** Wording when it was there but changed. */
  changedLabel: string;
  /** Wording that depends on the old signature (a cycle that was in progress and is now published). */
  changedLabelFor?: (previousSignature: string) => string;
};

export type SeenChange = { key: string; label: string };

export type SeenMap = Record<string, string>;

export function isSeenMap(value: unknown): value is SeenMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string")
  );
}

/** Short, stable fingerprint of a text (so feedback text itself isn't stored). */
function textHash(text: string) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function cycleSeenKey(cycleNumber: number) {
  return `cycle:${cycleNumber}`;
}

export function weekSeenKey(weekStart: string) {
  return `week:${weekStart}`;
}

export const LIVESTREAM_SEEN_KEY = "livestream";
export const PORTFOLIO_SEEN_KEY = "portfolio";

/**
 * A cycle as soon as anything about it is visible: published (with its revision and producer
 * note), or check-in / final cut points posted while it is still in progress. The signature
 * starts with 1 (published) or 0, so a cycle that goes from in progress to published says so.
 */
function cycleSeenItems(data: GradesMePayload): SeenItem[] {
  const ordered = [...data.cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
  return ordered.flatMap<SeenItem>((cycle, index) => {
    // The estimated arrays follow every cycle in order, so the index is the position here.
    const finalCut = data.estimated?.packages.finalCutPoints[index] ?? null;
    const checkIn = data.estimated?.packages.checkInPoints[index] ?? null;
    if (!cycle.published && finalCut === null && checkIn === null) return [];

    const name = `Cycle ${cycle.cycleNumber}`;
    const feedback = cycle.published ? cycle.feedback?.trim() ?? "" : "";
    const published = cycle.revised ? `${name} revised` : `${name} published`;
    const updated = cycle.revised ? `${name} revised` : `${name} updated`;
    return [
      {
        key: cycleSeenKey(cycle.cycleNumber),
        signature: [
          cycle.published ? 1 : 0,
          cycle.revised ? 1 : 0,
          cycle.revisedAt ?? "",
          finalCut ?? "",
          checkIn ?? "",
          feedback ? textHash(feedback) : ""
        ].join("|"),
        addedLabel: cycle.published ? published : `${name} scores posted`,
        changedLabel: cycle.published ? updated : `${name} scores updated`,
        changedLabelFor: cycle.published ? (previous) => (previous.startsWith("0|") ? published : updated) : undefined
      }
    ];
  });
}

/** Cycles (see above), graded weeks (latest first), livestream points and the portfolio. */
export function gradesSeenItems(data: GradesMePayload): SeenItem[] {
  const cycles = cycleSeenItems(data);

  const weeks = [...(data.gradebook?.weeks ?? [])]
    .filter((week) => week.graded)
    .reverse()
    .map<SeenItem>((week) => ({
      key: weekSeenKey(week.weekStart),
      signature: `${week.earned}/${week.possible}`,
      addedLabel: `week of ${shortDateFromKey(week.weekStart)} graded`,
      changedLabel: `week of ${shortDateFromKey(week.weekStart)} updated`
    }));

  const extras: SeenItem[] = [];
  const livestream = data.estimated?.packages.livestreamPoints ?? null;
  if (livestream !== null) {
    extras.push({
      key: LIVESTREAM_SEEN_KEY,
      signature: String(livestream),
      addedLabel: "livestream points posted",
      changedLabel: "livestream points updated"
    });
  }
  const portfolio = data.estimated?.portfolio.points ?? null;
  const feedback = data.gradebook?.portfolioFeedback?.trim() ?? "";
  if (portfolio !== null || feedback) {
    extras.push({
      key: PORTFOLIO_SEEN_KEY,
      signature: `${portfolio ?? ""}|${feedback ? textHash(feedback) : ""}`,
      addedLabel: portfolio !== null ? "portfolio graded" : "portfolio feedback posted",
      changedLabel: "portfolio updated"
    });
  }

  return [...cycles, ...weeks, ...extras];
}

/** What changed since `stored`. A first visit (nothing stored) flags nothing. */
export function seenChanges(stored: SeenMap | null, items: SeenItem[]): SeenChange[] {
  if (!stored) return [];
  return items.flatMap((item) => {
    const previous = stored[item.key];
    if (previous === item.signature) return [];
    if (previous === undefined) return [{ key: item.key, label: item.addedLabel }];
    return [{ key: item.key, label: item.changedLabelFor?.(previous) ?? item.changedLabel }];
  });
}

export function seenMapOf(items: SeenItem[]): SeenMap {
  return Object.fromEntries(items.map((item) => [item.key, item.signature]));
}

/** "Cycle 2 published · week of Oct 12 graded · 2 more" (empty when nothing changed). */
export function seenSummary(changes: SeenChange[], max = 3) {
  if (changes.length === 0) return "";
  const shown = changes.slice(0, max).map((change) => change.label);
  const rest = changes.length - shown.length;
  const text = [...shown, ...(rest > 0 ? [`${rest} more`] : [])].join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
