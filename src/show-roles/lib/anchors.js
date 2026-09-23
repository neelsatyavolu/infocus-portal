/**
 * Anchor rotation rules for 2026-27.
 *
 * Anchors rotate by week of the month: in weeks 1 and 4 they volunteer, and in
 * weeks 2 and 3 they are randomly selected. Anyone who volunteered during that
 * month is excluded from the random pool, so volunteering does not also enter
 * you into the lottery.
 */

export const ANCHOR_MODE_VOLUNTEER = "VOLUNTEER";
export const ANCHOR_MODE_RANDOM = "RANDOM";

/** Hours of notice required before a student can drop an anchor slot. */
export const ANCHOR_NOTICE_HOURS = 48;

/**
 * Week of the month, 1-indexed, counted by calendar date rather than by
 * weekday runs: days 1-7 are week 1, 8-14 week 2, and so on.
 */
export function weekOfMonth(date) {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

export function monthKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function anchorModeForDate(date) {
  const week = weekOfMonth(date);
  return week === 1 || week >= 4 ? ANCHOR_MODE_VOLUNTEER : ANCHOR_MODE_RANDOM;
}

export function isVolunteerWeek(date) {
  return anchorModeForDate(date) === ANCHOR_MODE_VOLUNTEER;
}

/**
 * Candidates for a random-selection week: everyone eligible to anchor who has
 * not volunteered this month, has not already anchored this month, did not do
 * PA that week, and is not otherwise blocked. Nobody anchors twice in the same month.
 */
export function randomAnchorCandidates({
  members,
  monthVolunteers = [],
  monthAnchors = [],
  nonAnchors = [],
  exempt = [],
  recentPaAnnouncers = []
}) {
  const blocked = new Set([
    ...monthVolunteers,
    ...monthAnchors,
    ...nonAnchors,
    ...exempt,
    ...recentPaAnnouncers
  ]);
  return members.filter((member) => !blocked.has(member));
}

/**
 * PA announcers are drawn from people who are not anchoring that month.
 */
export function randomPaCandidates({
  members,
  monthAnchors = [],
  nonAnchors = [],
  exempt = []
}) {
  const blocked = new Set([...monthAnchors, ...nonAnchors, ...exempt]);
  return members.filter((member) => !blocked.has(member));
}

/** Fisher-Yates. `random` is injectable so tests can pin a shuffle. */
export function shuffle(items, random = Math.random) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function pickRandom(items, count = 2, random = Math.random) {
  return shuffle(items, random).slice(0, count);
}

/**
 * Suggest anchors for a random week by shuffling the eligible pool.
 * Volunteers, people who already anchored this month, non-anchors, and
 * exempt producers are excluded first. The remaining names are not
 * sorted A–Z.
 */
export function suggestRandomAnchors({
  anchorHistoryRows,
  monthVolunteers = [],
  monthAnchors = [],
  count = 2,
  random = Math.random
}) {
  const blocked = new Set([...monthVolunteers, ...monthAnchors]);
  const eligible = anchorHistoryRows
    .filter((row) => !row.isNonAnchor && !row.isExempt && !blocked.has(row.name))
    .map((row) => row.name);

  return pickRandom(eligible, count, random);
}

/**
 * Whether a student gave enough notice to drop an anchor slot without a
 * participation deduction.
 */
export function hasSufficientAnchorNotice(showDate, noticeAt) {
  if (!showDate || !noticeAt) {
    return false;
  }

  const hours = (showDate.getTime() - noticeAt.getTime()) / (60 * 60 * 1000);
  return hours >= ANCHOR_NOTICE_HOURS;
}
