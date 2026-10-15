/**
 * The Class Board's one type scale. Every size is a multiple of --b: 15px below lg, and on lg
 * (the viewport-locked TV layout) it follows the viewport height, about 17px on a 1080p TV and
 * 15px on a 920px-tall mirrored Mac. Because the unit tracks the height, the board keeps the same
 * proportions, and the same no-scroll fit, on any classroom screen. It is also capped at 1vw, so
 * a tall, narrow window (a portrait iPad Pro, half of a 1440p monitor) doesn't get type too big
 * for its columns; 16:9 and 16:10 screens never reach that cap. The small sizes (labels, tags,
 * mono dates) never go under DESIGN.md's 11px label floor, even when a short laptop window holds
 * --b at its 13px minimum.
 *
 * Tailwind only sees literal class names, so the tokens are spelled out here. The board root
 * (and the loading skeleton) carry BOARD_SCALE; children read the tokens with
 * text-[length:var(--b-*)] or the BOARD_TEXT classes below.
 */
export const BOARD_SCALE = [
  "[--b:15px] lg:[--b:clamp(13px,min(1.6dvh,1vw),26px)]",
  "[--b-label:max(11px,calc(var(--b)*0.8))] [--b-meta:calc(var(--b)*0.875)] [--b-mono:max(11px,calc(var(--b)*0.8))]",
  "[--b-focus:calc(var(--b)*1.125)] [--b-tag:max(11px,calc(var(--b)*0.8))]",
  "[--b-h1:calc(var(--b)*1.6)] lg:[--b-h1:calc(var(--b)*1.75)]",
  "[--b-clock:calc(var(--b)*1.4)] lg:[--b-clock:calc(var(--b)*2)]",
  "[--b-countdown:calc(var(--b)*1.6)] lg:[--b-countdown:calc(var(--b)*2.25)]",
  // The cards' px-4 plus their 1px border. The nameplate has no side border, so it pads by this
  // much and its text lines up with the text in the cards below.
  "[--b-inset:calc(1rem_+_1px)]",
  // The leading column every rail section shares, so first columns line up down the rail.
  "[--b-lead:4.5rem] lg:[--b-lead:calc(var(--b)*5.5)]",
  // Section header heights. The race header and the rail's first header share --b-head-tall on
  // lg, so their bottom rules form one line across the board. Below xl the race's stage names
  // take two staggered rows (board-race.tsx), so the shared height is taller there.
  "[--b-head:calc(var(--b)*2.5)] [--b-head-tall:calc(var(--b)*2.5)]",
  "lg:[--b-head-tall:calc(var(--b)*5)] xl:[--b-head-tall:calc(var(--b)*2.75)]",
  "[--b-row:calc(var(--b)*1.75)]",
  // lg row heights for the rail lists that show whole rows only: a livestream (two lines, a little
  // padding, the divider) and the smallest calendar day (one line: its tag, 0.2b above and below,
  // the divider). The Livestreams list keeps every calendar day's --b-day free before it takes
  // more rows (board-rail.tsx). Kept tight so a 1080p TV shows about four livestreams.
  "lg:[--b-stream:calc(var(--b)*2.8_+_3px)] lg:[--b-day:calc(var(--b)*1.75_+_4px)]"
].join(" ");

export const BOARD_TEXT = {
  /** ALL CAPS Medium label: column heads, section titles, eyebrows, the date. */
  label: "text-[length:var(--b-label)] font-medium uppercase leading-[1.2] tracking-[0.12em]",
  /** Small Mist/muted lines: names, crew, places. */
  meta: "text-[length:var(--b-meta)] leading-[1.35]",
  body: "text-[length:var(--b)] leading-[1.3]",
  /** Geist Mono data (dates, times), about 0.9× the Lexend beside it. */
  mono: "font-mono-broadcast text-[length:var(--b-mono)] tabular-nums leading-[1.25]",
  focus: "text-[length:var(--b-focus)] font-semibold leading-[1.2]",
  h1: "text-[length:var(--b-h1)] font-semibold leading-[1.1] tracking-[-0.02em]",
  clock: "font-mono-broadcast text-[length:var(--b-clock)] font-medium leading-none tabular-nums",
  countdown: "font-mono-broadcast text-[length:var(--b-countdown)] font-medium leading-none tabular-nums",
  /** A role name inside a line of names ("ANCHORS Sage · Otto"). */
  role: "mr-[0.45em] text-[length:var(--b-label)] font-medium uppercase tracking-[0.1em] text-muted-foreground"
} as const;

/**
 * The nameplate's lg grid: wordmark | identity | focus | countdown | time. The time column is
 * (width - 1rem) / 3, exactly the body grid's right rail, so the clock sits over the rail and the
 * countdown ends over the race's right edge. Shared by the plate and its loading skeleton.
 */
export const PLATE_GRID = "lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.15fr)_auto_calc((100%_-_1rem)/3)]";

/** The nameplate's wordmark cell on lg: the three plate rows tall, with a rule on its right. */
export const PLATE_MARK =
  "flex shrink-0 items-center lg:self-stretch lg:border-r lg:border-[var(--ink-4)] lg:pl-[var(--b-inset)] lg:pr-4 lg:[grid-area:1/1/4/2]";
