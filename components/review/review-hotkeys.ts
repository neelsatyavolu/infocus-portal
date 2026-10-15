/**
 * Guards for the review page's single-key shortcuts (Space, ←/→, , . , C, Esc).
 * - Space plays and pauses wherever focus is, as it always has, except in a text field. On a
 *   focused button, link or tab the shortcut takes the key, so after clicking Resolve, Refresh or
 *   a tab, Space resumes the video instead of pressing that control again (Enter still presses it).
 * - The other keys leave text fields and controls that use those keys themselves alone (tabs,
 *   radios, sliders, the splitter, menus, lists, comboboxes), so arrows keep moving them.
 * Nothing runs with a modifier, during IME composition, or while a dialog, menu or list is open.
 */

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const KEY_CONTROL_ROLES = new Set([
  "tab",
  "radio",
  "slider",
  "separator",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "listbox",
  "combobox",
  "spinbutton"
]);

type TargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
};

function asTarget(target: EventTarget | null) {
  const element = target as TargetLike | null;
  return element && typeof element === "object" ? element : null;
}

/** A text field, select or rich-text editor: every key belongs to it. */
export function isTextEntryTarget(target: EventTarget | null) {
  const element = asTarget(target);
  if (!element) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  if (element.tagName && TEXT_ENTRY_TAGS.has(element.tagName.toUpperCase())) {
    return true;
  }
  return element.getAttribute?.("role") === "textbox";
}

/** A text field, or a control that uses arrow or letter keys itself. */
export function isKeyControlTarget(target: EventTarget | null) {
  if (isTextEntryTarget(target)) {
    return true;
  }
  const role = asTarget(target)?.getAttribute?.("role");
  return Boolean(role && KEY_CONTROL_ROLES.has(role));
}

function isRangeInput(element: TargetLike) {
  return element.tagName?.toUpperCase() === "INPUT" && element.getAttribute?.("type") === "range";
}

/** Space may play/pause here: anywhere but a text field (the seek and volume sliders don't use Space). */
export function isSpacePlayTarget(target: EventTarget | null) {
  const element = asTarget(target);
  if (!element) {
    return true;
  }
  return isRangeInput(element) || !isTextEntryTarget(target);
}

const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]'
].join(", ");

/** A dialog, sheet, menu, popover menu or Select list is open. */
export function overlayOpen(doc: Pick<Document, "querySelector"> | null | undefined = typeof document === "undefined" ? null : document) {
  return Boolean(doc?.querySelector(OPEN_OVERLAY_SELECTOR));
}

export type ShortcutEventLike = Pick<
  KeyboardEvent,
  "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented" | "isComposing" | "target"
>;

export const SEEK_STEP_SECONDS = 5;

export type ReviewShortcut = "toggle-play" | "seek-back" | "seek-forward" | "frame-back" | "frame-forward" | "focus-composer" | "cancel";

/** A page shortcut (not Esc) may run for this key press. */
export function shouldHandleReviewShortcut(
  event: ShortcutEventLike,
  shortcut: Exclude<ReviewShortcut, "cancel">,
  overlayIsOpen = overlayOpen()
) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || overlayIsOpen) {
    return false;
  }
  if (shortcut === "toggle-play") {
    return isSpacePlayTarget(event.target);
  }
  return !event.defaultPrevented && !isKeyControlTarget(event.target);
}

/** Maps a key to a review shortcut. Images only get C and Esc. */
export function reviewShortcutForKey(key: string, isImageReview: boolean): ReviewShortcut | null {
  if (key === "Escape") return "cancel";
  if (key === "c" || key === "C") return "focus-composer";
  if (isImageReview) return null;
  if (key === " " || key === "Spacebar") return "toggle-play";
  if (key === "ArrowLeft") return "seek-back";
  if (key === "ArrowRight") return "seek-forward";
  if (key === ",") return "frame-back";
  if (key === ".") return "frame-forward";
  return null;
}
