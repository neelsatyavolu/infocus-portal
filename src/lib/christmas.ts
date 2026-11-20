import { HALLOWEEN_CLASS } from "@/src/lib/halloween";

/**
 * Christmas season: December 1 through December 31 (the viewer's local time) the Portal wears the
 * InFocus Christmas 2026 Package (`<html class="christmas">`, globals.css: holly green, scarlet,
 * the Santa-hat logos in public/christmas/) and the signed-in shell is decorated: a string of
 * lights along the top, falling snow, a snowy hill with trees, and visitors (falling presents,
 * a gingerbread man, cocoa, Santa's sleigh, a rare shooting star) plus typed secrets
 * (components/christmas/). Christmas outranks Thanksgiving and Halloween: while it is on they
 * step aside. Each browser can turn it or its sounds off in Settings → Appearance, and super
 * admins can preview it in their own browser any day of the year. Everything lives in localStorage.
 */

export const CHRISTMAS_CLASS = "christmas";
export const CHRISTMAS_STORAGE_KEY = "infocus-christmas";
export const CHRISTMAS_CHANGE_EVENT = "infocus-christmas-change";
/** Named here (not imported) so thanksgiving.ts can import this file without a cycle. */
const THANKSGIVING_CLASS_NAME = "thanksgiving";

/** December (0-based month 11), every day of it. */
const SEASON_MONTH = 11;

export type ChristmasPrefs = {
  /** The viewer turned the season off in this browser. */
  off: boolean;
  /** The viewer muted the sounds. */
  muted: boolean;
  /** The viewer turned the falling snow off. */
  snowOff: boolean;
  /** A super admin turned the theme on in this browser outside the season. */
  preview: boolean;
  /** Presents caught in this browser, ever. */
  gifts: number;
  /** Gingerbread men caught and cocoa sipped in this browser, ever. */
  treats: number;
};

export const DEFAULT_CHRISTMAS_PREFS: ChristmasPrefs = {
  off: false,
  muted: false,
  snowOff: false,
  preview: false,
  gifts: 0,
  treats: 0
};

export function isChristmasSeason(now: Date): boolean {
  return now.getMonth() === SEASON_MONTH;
}

export function isChristmasEve(now: Date): boolean {
  return now.getMonth() === SEASON_MONTH && now.getDate() === 24;
}

export function isChristmasDay(now: Date): boolean {
  return now.getMonth() === SEASON_MONTH && now.getDate() === 25;
}

/** Whole days until December 25 of `now`'s year (0 on Christmas, negative after it). */
export function daysUntilChristmas(now: Date): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const christmas = Date.UTC(now.getFullYear(), SEASON_MONTH, 25);
  return Math.round((christmas - today) / 86_400_000);
}

/** Whether this browser still needs this year's welcome (never if storage is blocked, so it can't nag). */
export function needsChristmasWelcome(stored: string | null | undefined, now: Date): boolean {
  return stored !== String(now.getFullYear());
}

/** On in season or while previewing, unless this browser turned it off. */
export function isChristmasOn(prefs: ChristmasPrefs, now: Date): boolean {
  return !prefs.off && (prefs.preview || isChristmasSeason(now));
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function parseChristmasPrefs(raw: string | null | undefined): ChristmasPrefs {
  if (!raw) return DEFAULT_CHRISTMAS_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<ChristmasPrefs> | null;
    return {
      off: parsed?.off === true,
      muted: parsed?.muted === true,
      snowOff: parsed?.snowOff === true,
      preview: parsed?.preview === true,
      gifts: count(parsed?.gifts),
      treats: count(parsed?.treats)
    };
  } catch {
    return DEFAULT_CHRISTMAS_PREFS;
  }
}

/**
 * Runs in <head> before first paint, after the Halloween and Thanksgiving scripts, so December
 * pages never flash another season. Same rule as isChristmasOn; while it is on, the other two
 * seasons step aside.
 */
export const CHRISTMAS_INIT_SCRIPT = `(function(){try{var p=null;try{p=JSON.parse(localStorage.getItem("${CHRISTMAS_STORAGE_KEY}")||"null")}catch(e){}if(p&&p.off===true)return;if(new Date().getMonth()!==${SEASON_MONTH}&&!(p&&p.preview===true))return;var c=document.documentElement.classList;c.add("${CHRISTMAS_CLASS}");c.remove("${THANKSGIVING_CLASS_NAME}");c.remove("${HALLOWEEN_CLASS}");}catch(e){}})();`;

/** Words typed outside a text box that set off a secret. */
export type ChristmasSecret = "snow" | "santa" | "jingle" | "gift" | "merry" | "rudolph";

const SECRET_WORDS: readonly ChristmasSecret[] = ["rudolph", "jingle", "santa", "merry", "snow", "gift"];
/** How many recent keys the matcher needs to see. */
export const CHRISTMAS_SECRET_MEMORY = Math.max(...SECRET_WORDS.map((word) => word.length));

/** The secret the last keys (lowercased `KeyboardEvent.key` values) just finished, if any. */
export function matchChristmasSecret(keys: readonly string[]): ChristmasSecret | null {
  return SECRET_WORDS.find((word) => keys.slice(-word.length).join("") === word) ?? null;
}

export function readChristmasPrefs(): ChristmasPrefs {
  try {
    return parseChristmasPrefs(window.localStorage.getItem(CHRISTMAS_STORAGE_KEY));
  } catch {
    return DEFAULT_CHRISTMAS_PREFS;
  }
}

/**
 * Sets the Christmas class on <html>. Called first by applySeasonClasses (src/lib/thanksgiving.ts),
 * which then lets Thanksgiving and Halloween step aside while it is on.
 */
export function applyChristmasClass(prefs: ChristmasPrefs = readChristmasPrefs()) {
  document.documentElement.classList.toggle(CHRISTMAS_CLASS, isChristmasOn(prefs, new Date()));
}

/**
 * Saves the preferences and tells every listener in this tab. Changing `off` or `preview` also
 * needs applySeasonClasses() afterwards (the Settings switches do that), so the other seasons
 * come back when Christmas goes away.
 */
export function writeChristmasPrefs(next: ChristmasPrefs) {
  try {
    window.localStorage.setItem(CHRISTMAS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private windows can block storage; the choice still applies until the page reloads.
  }
  applyChristmasClass(next);
  window.dispatchEvent(new CustomEvent(CHRISTMAS_CHANGE_EVENT, { detail: next }));
}
