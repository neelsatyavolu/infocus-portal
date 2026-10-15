/**
 * One status vocabulary for the whole Portal (DESIGN.md §10 tags). Every kit part that shows a
 * status takes a `StatusToneInput`; the aliases let existing helpers (group tile tones, the
 * `status-*` class maps in src/lib) plug in without a lookup table at each call site.
 */
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "review" | "info" | "live" | "muted";

/** Accepted spellings. `approved`/`ok` → success, `warn`/`caution` → warning, `error` → danger. */
export type StatusToneInput = StatusTone | "ok" | "approved" | "warn" | "caution" | "error";

const ALIASES: Record<StatusToneInput, StatusTone> = {
  neutral: "neutral",
  success: "success",
  ok: "success",
  approved: "success",
  warning: "warning",
  warn: "warning",
  caution: "warning",
  danger: "danger",
  error: "danger",
  review: "review",
  info: "info",
  live: "live",
  muted: "muted"
};

export function resolveTone(tone: StatusToneInput | null | undefined): StatusTone {
  return (tone && ALIASES[tone]) || "neutral";
}

/** The globals.css tag class for a tone (`.status-pill` + one of these). */
const TAG_CLASS: Record<StatusTone, string> = {
  neutral: "status-neutral",
  success: "status-approved",
  warning: "status-warn",
  danger: "status-danger",
  review: "status-review",
  info: "status-review",
  live: "status-live",
  muted: "status-muted"
};

export function statusTagClass(tone: StatusToneInput | null | undefined) {
  return TAG_CLASS[resolveTone(tone)];
}

/**
 * Maps an existing `status-*` class (e.g. CYCLE_STAGE_STATUS_CLASS, groupTileStatusClass) back to
 * a tone, so `<StatusTag tone={toneFromStatusClass(CYCLE_STAGE_STATUS_CLASS[status])}>` works.
 */
export function toneFromStatusClass(className: string | null | undefined): StatusTone {
  const match = className?.match(/\bstatus-(approved|warn|danger|neutral|review|live|muted)\b/);
  switch (match?.[1]) {
    case "approved":
      return "success";
    case "warn":
      return "warning";
    case "danger":
      return "danger";
    case "review":
      return "review";
    case "live":
      return "live";
    case "muted":
      return "muted";
    default:
      return "neutral";
  }
}

/** Text color for a tone when it is used on an icon or a number (not a tag). */
const TEXT_CLASS: Record<StatusTone, string> = {
  neutral: "text-[var(--ink-text)]",
  success: "text-[var(--brand-green)]",
  warning: "text-[var(--brand-amber)]",
  danger: "text-danger",
  review: "text-foreground",
  info: "text-foreground",
  live: "text-foreground",
  muted: "text-muted-foreground"
};

export function toneTextClass(tone: StatusToneInput | null | undefined) {
  return TEXT_CLASS[resolveTone(tone)];
}

/** "99+" past the cap; never negative. */
export function formatCount(count: number, max = 99) {
  const safe = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return safe > max ? `${max}+` : String(safe);
}

/** "Today", "in 3d", "3d ago" — one countdown wording for due dates everywhere. */
export function relativeDaysLabel(days: number) {
  const whole = Math.trunc(days);
  if (whole === 0) return "Today";
  return whole > 0 ? `in ${whole}d` : `${Math.abs(whole)}d ago`;
}

/** Overdue is danger, today or tomorrow is warning, later is neutral. */
export function dueTone(days: number): StatusTone {
  if (days < 0) return "danger";
  if (days <= 1) return "warning";
  return "neutral";
}
