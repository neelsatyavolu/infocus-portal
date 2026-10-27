/**
 * Halloween season: from October 15 through November 1 (the viewer's local time) the Portal wears
 * the InFocus Halloween 2026 Package colors and logos (`<html class="halloween">`, globals.css)
 * and the signed-in shell gets its visitors and cobwebs (components/halloween/).
 * Outside the season nothing changes. Each browser can turn the season, its sounds, its music or
 * its surprise BOOs or hauntings off in Settings → Appearance; those choices and the pumpkin and candy
 * counts live in localStorage.
 */

export const HALLOWEEN_CLASS = "halloween";
export const HALLOWEEN_STORAGE_KEY = "infocus-halloween";
export const HALLOWEEN_CHANGE_EVENT = "infocus-halloween-change";

/** Inclusive month/day bounds (months are 0-based, like Date). */
const SEASON_START = { month: 9, day: 15 };
const SEASON_END = { month: 10, day: 1 };

export type HalloweenPrefs = {
  /** The viewer turned the season off in this browser. */
  off: boolean;
  /** The viewer muted the spooky sounds. */
  muted: boolean;
  /** The viewer turned the background music off. */
  musicOff: boolean;
  /** The viewer turned the random big BOOs off. */
  scaresOff: boolean;
  /** The viewer turned the hauntings (strange things happening to the page) off. */
  hauntsOff: boolean;
  /** Pumpkins smashed in this browser, ever. */
  smashed: number;
  /** Candy caught in this browser, ever. */
  candy: number;
};

export const DEFAULT_HALLOWEEN_PREFS: HalloweenPrefs = {
  off: false,
  muted: false,
  musicOff: false,
  scaresOff: false,
  hauntsOff: false,
  smashed: 0,
  candy: 0
};

export function isHalloweenSeason(now: Date): boolean {
  const key = now.getMonth() * 100 + now.getDate();
  return key >= SEASON_START.month * 100 + SEASON_START.day && key <= SEASON_END.month * 100 + SEASON_END.day;
}

export function isHalloweenDay(now: Date): boolean {
  return now.getMonth() === 9 && now.getDate() === 31;
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function parseHalloweenPrefs(raw: string | null | undefined): HalloweenPrefs {
  if (!raw) return DEFAULT_HALLOWEEN_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<HalloweenPrefs> | null;
    return {
      off: parsed?.off === true,
      muted: parsed?.muted === true,
      musicOff: parsed?.musicOff === true,
      scaresOff: parsed?.scaresOff === true,
      hauntsOff: parsed?.hauntsOff === true,
      smashed: count(parsed?.smashed),
      candy: count(parsed?.candy)
    };
  } catch {
    return DEFAULT_HALLOWEEN_PREFS;
  }
}

/**
 * Runs in <head> before first paint, next to the theme script, so Halloween pages never flash
 * green. Same rule as isHalloweenSeason (Oct 15 – Nov 1) and the `off` preference.
 */
export const HALLOWEEN_INIT_SCRIPT = `(function(){try{var d=new Date(),k=d.getMonth()*100+d.getDate();if(k<${SEASON_START.month * 100 + SEASON_START.day}||k>${SEASON_END.month * 100 + SEASON_END.day})return;var p=null;try{p=JSON.parse(localStorage.getItem("${HALLOWEEN_STORAGE_KEY}")||"null")}catch(e){}if(p&&p.off===true)return;document.documentElement.classList.add("${HALLOWEEN_CLASS}");}catch(e){}})();`;

/** Words typed outside a text box that set off a secret, and the Konami code. */
export type HalloweenSecret = "boo" | "treat" | "trick" | "konami";

const SECRET_WORDS = ["boo", "treat", "trick"] as const;
export const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
/** How many recent keys the matcher needs to see. */
export const SECRET_MEMORY = KONAMI.length;

/** The secret the last keys (lowercased `KeyboardEvent.key` values) just finished, if any. */
export function matchHalloweenSecret(keys: readonly string[]): HalloweenSecret | null {
  if (keys.join(",").endsWith(KONAMI.join(","))) return "konami";
  return SECRET_WORDS.find((word) => keys.slice(-word.length).join("") === word) ?? null;
}

export function readHalloweenPrefs(): HalloweenPrefs {
  try {
    return parseHalloweenPrefs(window.localStorage.getItem(HALLOWEEN_STORAGE_KEY));
  } catch {
    return DEFAULT_HALLOWEEN_PREFS;
  }
}

/** Saves the preferences, updates the <html> class and tells every listener in this tab. */
export function writeHalloweenPrefs(next: HalloweenPrefs) {
  try {
    window.localStorage.setItem(HALLOWEEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private windows can block storage; the choice still applies until the page reloads.
  }
  document.documentElement.classList.toggle(HALLOWEEN_CLASS, !next.off && isHalloweenSeason(new Date()));
  window.dispatchEvent(new CustomEvent(HALLOWEEN_CHANGE_EVENT, { detail: next }));
}
