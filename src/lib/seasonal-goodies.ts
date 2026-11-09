/**
 * One per-browser switch for every holiday season's extras (Halloween's visitors and scares,
 * Thanksgiving's leaves, pies and turkeys, and any later season). Turning it off hides the extras
 * but keeps the season's colors and logos, which each season's own switch still controls
 * (src/lib/halloween.ts, src/lib/thanksgiving.ts). Lives in localStorage.
 */

export const SEASONAL_GOODIES_STORAGE_KEY = "infocus-seasonal-goodies";
export const SEASONAL_GOODIES_CHANGE_EVENT = "infocus-seasonal-goodies-change";

/** True unless this browser saved `{"off":true}`. */
export function parseSeasonalGoodiesOn(raw: string | null | undefined): boolean {
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as { off?: unknown } | null;
    return parsed?.off !== true;
  } catch {
    return true;
  }
}

/** Saves the choice and tells every listener in this tab. */
export function writeSeasonalGoodiesOn(on: boolean) {
  try {
    window.localStorage.setItem(SEASONAL_GOODIES_STORAGE_KEY, JSON.stringify({ off: !on }));
  } catch {
    // Private windows can block storage; the choice still applies until the page reloads.
  }
  window.dispatchEvent(new CustomEvent(SEASONAL_GOODIES_CHANGE_EVENT, { detail: on }));
}
