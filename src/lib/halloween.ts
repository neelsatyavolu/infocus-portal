/**
 * Halloween season: from October 15 through November 1 (the viewer's local time) the Portal wears
 * the InFocus Halloween 2026 Package colors and logos (`<html class="halloween">`, globals.css)
 * and the signed-in shell gets its pumpkins, bats, ghost and spider (components/halloween/).
 * Outside the season nothing changes. Each browser can turn the season, its sounds or its music
 * off in Settings → Appearance; those choices and the pumpkin count live in localStorage.
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
  /** Pumpkins smashed in this browser, ever. */
  smashed: number;
};

export const DEFAULT_HALLOWEEN_PREFS: HalloweenPrefs = { off: false, muted: false, musicOff: false, smashed: 0 };

export function isHalloweenSeason(now: Date): boolean {
  const key = now.getMonth() * 100 + now.getDate();
  return key >= SEASON_START.month * 100 + SEASON_START.day && key <= SEASON_END.month * 100 + SEASON_END.day;
}

export function isHalloweenDay(now: Date): boolean {
  return now.getMonth() === 9 && now.getDate() === 31;
}

export function parseHalloweenPrefs(raw: string | null | undefined): HalloweenPrefs {
  if (!raw) return DEFAULT_HALLOWEEN_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<HalloweenPrefs> | null;
    const smashed = Number(parsed?.smashed);
    return {
      off: parsed?.off === true,
      muted: parsed?.muted === true,
      musicOff: parsed?.musicOff === true,
      smashed: Number.isFinite(smashed) && smashed > 0 ? Math.floor(smashed) : 0
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
