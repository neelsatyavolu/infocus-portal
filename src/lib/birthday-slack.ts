/**
 * The midnight birthday post in Slack #announcements: the message text and the animated card's
 * timing. The card is drawn in src/server/birthday-slack-gif.tsx; the post runs from
 * src/server/birthday-slack.ts.
 */
import type { DisplayNamedPerson } from "@/src/lib/user-display";

export type BirthdaySlackPerson = { name: string; slackUserId: string | null };

/** Nickname, else the first word of the name, else the email's name part. */
export function birthdayFirstName(person: DisplayNamedPerson) {
  return (
    person.nickname?.trim() ||
    person.name?.trim().split(/\s+/)[0] ||
    person.email?.trim().split("@")[0] ||
    "Someone"
  );
}

function joinNames(names: string[], conjunction: string) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

/** "Abby", "Abby & Otto", "Abby, Otto & Sage". */
export function birthdayCardNames(names: string[]) {
  return joinNames(names, "&");
}

function escapeSlack(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tags each person Slack knows (by email) and names the rest. */
export function birthdaySlackText(people: BirthdaySlackPerson[]) {
  const names = people.map((person) => (person.slackUserId ? `<@${person.slackUserId}>` : escapeSlack(person.name)));
  return `🎂 Happy birthday, ${joinNames(names, "and")}! Hope it's a great one.`;
}

export function birthdaySlackFileName(names: string[]) {
  const slug = names
    .join(" ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `happy-birthday-${slug}.gif` : "happy-birthday.gif";
}

// ---- Animation (DESIGN.md §5): the announcement card's build, looped to open on the finished card.

/** Seconds from the standby icon to the finished card. */
export const BIRTHDAY_BUILD_SECONDS = 2.2;
/** Seconds from the finished card back to the standby icon. */
export const BIRTHDAY_EXIT_SECONDS = 1.1;
const FRAME_SECONDS = 0.05;
const FRAME_MS = 50;
const CARD_HOLD_MS = 2600;
const ICON_HOLD_MS = 900;

export type BirthdayFramePhase = { phase: "build" | "exit"; t: number };
export type BirthdayGifFrame = BirthdayFramePhase & { delayMs: number };

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const curve = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (curve(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return curve(y1, y2, (lo + hi) / 2);
  };
}

const easeOut = bezier(0.16, 1, 0.3, 1);
const easeIn = bezier(0.7, 0, 0.84, 0);
const backOut = bezier(0.34, 1.56, 0.64, 1);
const progress = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));
/** Exact 0 and 1 at the ends, so the first and last frames match. */
const ease = (fn: (x: number) => number, x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : fn(x));

/** How far along each piece of the card is (0–1), plus the icon's turn in degrees. */
export function birthdayCardState({ phase, t }: BirthdayFramePhase) {
  if (phase === "exit") {
    const iconIn = ease(easeOut, progress(t, 0.5, BIRTHDAY_EXIT_SECONDS));
    return {
      icon: iconIn,
      iconTurn: 30 * (1 - iconIn),
      content: 1 - ease(easeIn, progress(t, 0, 0.5)),
      dot: 1,
      kicker: 1,
      mark: 1,
      rule: 1,
      title: 1,
      strip: 1,
      stripText: 1
    };
  }
  const iconOut = ease(easeIn, progress(t, 0, 0.4));
  return {
    icon: 1 - iconOut,
    iconTurn: -30 * iconOut,
    content: 1,
    dot: ease(backOut, progress(t, 0.4, 0.75)),
    kicker: ease(easeOut, progress(t, 0.45, 1.0)),
    mark: ease(easeOut, progress(t, 0.55, 1.1)),
    rule: ease(easeOut, progress(t, 0.6, 1.3)),
    title: ease(easeOut, progress(t, 0.85, 1.6)),
    strip: ease(easeOut, progress(t, 1.3, 2.0)),
    stripText: ease(easeOut, progress(t, 1.6, BIRTHDAY_BUILD_SECONDS))
  };
}

/**
 * One loop: the finished card (held, so a still preview in Slack shows the name), the exit to the
 * standby icon (held), then the build back up to the card.
 */
export function birthdayGifFrames(): BirthdayGifFrame[] {
  const steps = (seconds: number) => Math.round(seconds / FRAME_SECONDS);
  const exitSteps = steps(BIRTHDAY_EXIT_SECONDS);
  const exit = Array.from({ length: exitSteps }, (_, index) => ({
    phase: "exit" as const,
    t: (index + 1) * FRAME_SECONDS,
    delayMs: index + 1 === exitSteps ? ICON_HOLD_MS : FRAME_MS
  }));
  const build = Array.from({ length: steps(BIRTHDAY_BUILD_SECONDS) - 1 }, (_, index) => ({
    phase: "build" as const,
    t: (index + 1) * FRAME_SECONDS,
    delayMs: FRAME_MS
  }));
  return [{ phase: "build", t: BIRTHDAY_BUILD_SECONDS, delayMs: CARD_HOLD_MS }, ...exit, ...build];
}
