import { shortcutKeys } from "@/components/kit/kbd";

/** The call's keyboard shortcuts: the one source for the bindings (useCallShortcuts), tooltips and the legend. */
export const CALL_SHORTCUTS = {
  mic: "mod+d",
  camera: "mod+e",
  hand: "mod+alt+h",
  chat: "mod+alt+c"
} as const;

export type CallShortcut = keyof typeof CALL_SHORTCUTS;

type ShortcutKeyEvent = Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "code">;

/**
 * Which call shortcut a keydown is: ⌘ or Ctrl, ⌥/Alt exactly when the combo has "alt", never
 * Shift, and the letter by physical key (event.code), so ⌥ letters on a Mac still match.
 */
export function matchCallShortcut(event: ShortcutKeyEvent): CallShortcut | null {
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return null;
  const names = Object.keys(CALL_SHORTCUTS) as CallShortcut[];
  return (
    names.find((name) => {
      const parts = CALL_SHORTCUTS[name].split("+");
      const letter = parts[parts.length - 1];
      return parts.includes("alt") === event.altKey && event.code === `Key${letter.toUpperCase()}`;
    }) ?? null
  );
}

/** Apple keyboards show ⌘ and ⌥; Windows, Chromebooks and Linux show Ctrl and Alt. */
function isApplePlatform() {
  if (typeof navigator === "undefined") return true;
  const hinted = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return /mac|iphone|ipad|ipod/i.test(hinted || navigator.platform || navigator.userAgent);
}

/** "mod+alt+h" → ["⌘", "⌥", "H"] on a Mac, ["Ctrl", "Alt", "H"] elsewhere. */
export function shortcutKeyList(combo: string) {
  return shortcutKeys(combo, isApplePlatform());
}

/** "mod+alt+h" → "⌘⌥H" on a Mac, "Ctrl+Alt+H" elsewhere (tooltips). */
export function shortcutLabel(combo: string) {
  const mac = isApplePlatform();
  return shortcutKeys(combo, mac).join(mac ? "" : "+");
}
