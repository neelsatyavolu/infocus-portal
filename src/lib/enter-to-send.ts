type EnterKeyEvent = {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
};

/** True when the primary pointer is a finger (phones, tablets). False on the server. */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Whether Enter in a composer should send. A touch keyboard has no Shift+Enter, so there Enter
 * always adds a newline and sending is by the Send button.
 */
export function shouldEnterSend(event: EnterKeyEvent, coarsePointer: boolean): boolean {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
    return false;
  }
  return !coarsePointer;
}
