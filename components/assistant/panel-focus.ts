const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusable controls inside `root` that are on screen (hidden tabs are skipped). */
function focusablesIn(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0
  );
}

/**
 * Keeps Tab inside the phone sheet: wraps from the last control to the first (and back), and
 * pulls focus in when it has escaped to the page behind.
 */
export function loopFocus(root: HTMLElement, event: KeyboardEvent) {
  const focusables = focusablesIn(root);
  if (focusables.length === 0) {
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  let target: HTMLElement | null = null;
  if (!active || !root.contains(active)) {
    target = event.shiftKey ? last : first;
  } else if (event.shiftKey && active === first) {
    target = last;
  } else if (!event.shiftKey && active === last) {
    target = first;
  }
  if (target) {
    event.preventDefault();
    target.focus();
  }
}
