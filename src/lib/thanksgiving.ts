import { applyHalloweenClass, HALLOWEEN_CLASS } from "@/src/lib/halloween";

/**
 * Thanksgiving season: November 1 through November 30 (the viewer's local time) the Portal wears
 * harvest colors (`<html class="thanksgiving">`, globals.css) and the signed-in shell gets its
 * visitors: falling leaves, pies, a strutting turkey and, now and then, a giant turkey
 * (components/thanksgiving/). Each browser can turn the season, its sounds or the giant turkey
 * off in Settings → Appearance. Super admins can also preview it in their own browser any day of
 * the year. Those choices and the leaf and pie counts live in localStorage.
 */

export const THANKSGIVING_CLASS = "thanksgiving";
export const THANKSGIVING_STORAGE_KEY = "infocus-thanksgiving";
export const THANKSGIVING_CHANGE_EVENT = "infocus-thanksgiving-change";

/** November (0-based month 10), every day of it. */
const SEASON_MONTH = 10;

export type ThanksgivingPrefs = {
  /** The viewer turned the season off in this browser. */
  off: boolean;
  /** The viewer muted the sounds. */
  muted: boolean;
  /** The viewer turned the giant turkey off. */
  turkeyOff: boolean;
  /** A super admin turned the theme on in this browser outside the season. */
  preview: boolean;
  /** Leaves caught in this browser, ever. */
  leaves: number;
  /** Pies eaten in this browser, ever. */
  pies: number;
};

export const DEFAULT_THANKSGIVING_PREFS: ThanksgivingPrefs = {
  off: false,
  muted: false,
  turkeyOff: false,
  preview: false,
  leaves: 0,
  pies: 0
};

export function isThanksgivingSeason(now: Date): boolean {
  return now.getMonth() === SEASON_MONTH;
}

/** The fourth Thursday of November. */
export function isThanksgivingDay(now: Date): boolean {
  return now.getMonth() === SEASON_MONTH && now.getDay() === 4 && now.getDate() >= 22 && now.getDate() <= 28;
}

/** On in season or while previewing, unless this browser turned it off. */
export function isThanksgivingOn(prefs: ThanksgivingPrefs, now: Date): boolean {
  return !prefs.off && (prefs.preview || isThanksgivingSeason(now));
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function parseThanksgivingPrefs(raw: string | null | undefined): ThanksgivingPrefs {
  if (!raw) return DEFAULT_THANKSGIVING_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<ThanksgivingPrefs> | null;
    return {
      off: parsed?.off === true,
      muted: parsed?.muted === true,
      turkeyOff: parsed?.turkeyOff === true,
      preview: parsed?.preview === true,
      leaves: count(parsed?.leaves),
      pies: count(parsed?.pies)
    };
  } catch {
    return DEFAULT_THANKSGIVING_PREFS;
  }
}

/**
 * Runs in <head> before first paint, right after the Halloween script, so Thanksgiving pages never
 * flash green. Same rule as isThanksgivingOn. While it is on, Halloween steps aside (a preview in
 * late October would otherwise show both).
 */
export const THANKSGIVING_INIT_SCRIPT = `(function(){try{var p=null;try{p=JSON.parse(localStorage.getItem("${THANKSGIVING_STORAGE_KEY}")||"null")}catch(e){}if(p&&p.off===true)return;if(new Date().getMonth()!==${SEASON_MONTH}&&!(p&&p.preview===true))return;var c=document.documentElement.classList;c.add("${THANKSGIVING_CLASS}");c.remove("${HALLOWEEN_CLASS}");}catch(e){}})();`;

/** Words typed outside a text box that set off a secret. */
export type ThanksgivingSecret = "gobble" | "pie" | "thanks";

const SECRET_WORDS: readonly ThanksgivingSecret[] = ["gobble", "thanks", "pie"];
/** How many recent keys the matcher needs to see. */
export const THANKSGIVING_SECRET_MEMORY = Math.max(...SECRET_WORDS.map((word) => word.length));

/** The secret the last keys (lowercased `KeyboardEvent.key` values) just finished, if any. */
export function matchThanksgivingSecret(keys: readonly string[]): ThanksgivingSecret | null {
  return SECRET_WORDS.find((word) => keys.slice(-word.length).join("") === word) ?? null;
}

export function readThanksgivingPrefs(): ThanksgivingPrefs {
  try {
    return parseThanksgivingPrefs(window.localStorage.getItem(THANKSGIVING_STORAGE_KEY));
  } catch {
    return DEFAULT_THANKSGIVING_PREFS;
  }
}

/** Saves the preferences, updates the <html> classes and tells every listener in this tab. */
export function writeThanksgivingPrefs(next: ThanksgivingPrefs) {
  try {
    window.localStorage.setItem(THANKSGIVING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private windows can block storage; the choice still applies until the page reloads.
  }
  document.documentElement.classList.toggle(THANKSGIVING_CLASS, isThanksgivingOn(next, new Date()));
  applyHalloweenClass();
  window.dispatchEvent(new CustomEvent(THANKSGIVING_CHANGE_EVENT, { detail: next }));
}
