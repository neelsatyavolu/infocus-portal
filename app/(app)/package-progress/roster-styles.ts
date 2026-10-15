/** Shared class strings for the roster's cells (one place, so every column lines up). */

/**
 * One line of a cell. Card mode (below @4xl, so phones, tablets and narrow windows) uses 40px
 * lines, the touch size, for anything you tap or type in; table mode uses 32px lines.
 */
export const LINE_HEIGHT = "min-h-10 @4xl:min-h-8";

/** A line of read-only text (Members and Producer in view mode): 32px in cards too. */
export const STATIC_LINE_HEIGHT = "min-h-8";

const LABEL_TEXT = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

/**
 * Caps label for a card-mode key/value line, on the same centre line as the 40px value beside it
 * (32px in table mode, where the column header names the cell and the label becomes sr-only).
 */
export const CELL_LABEL = `${LABEL_TEXT} leading-10 @4xl:leading-8`;

/** The label beside a STATIC_LINE_HEIGHT value: a 32px line in both modes. */
export const STATIC_CELL_LABEL = `${LABEL_TEXT} leading-8`;

/** Card-mode label column + value; table mode drops the label column. */
export const KEY_VALUE_CELL = "grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 @4xl:block";

/**
 * A calm field: no visible box until the row is hovered or the field has focus (always boxed on
 * touch screens, which have no hover). Fields pull out by their inset so their text lines up with
 * view mode and the column headers.
 */
export const FIELD_BORDER =
  "border border-transparent group-hover/row:border-input focus-within:border-input pointer-coarse:border-input";

/** 16px text on phones (no iOS zoom on focus), 14px from md. */
export const FIELD_TEXT = "text-base md:text-sm";

/**
 * Hover fill for a control inside a row. The row itself turns Ink 3 on hover (and while its menu
 * is open), so controls and chips on it step up to Ink 4 to stay visible.
 */
export const IN_ROW_HOVER = "hover:bg-[var(--ink-4)]";

/**
 * For a small StatusTag with `wrap`: wrap swaps the tag's 2px padding for 4px, which makes even a
 * one-line tag 22px. This keeps 2px and a 12px line, so a one-line tag is 18px like every other
 * small tag and only grows when its label really wraps. (The `.status-pill&` form outranks wrap's
 * own `py-1!`.)
 */
export const WRAP_TAG_SM = "[.status-pill&]:py-0.5! leading-3";
