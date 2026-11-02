import { resolveSessionCookieDomain } from "@/src/lib/hosts";

/**
 * Color theme. The preference is System (the default), Light or Dark; System follows the
 * device's light/dark setting and switches live when the device does. The preference is a cookie
 * on the shared session domain so the Portal subdomains (grades, teleprompter, equipment) agree.
 * `<html>` carries the resolved theme as a class (`dark` / `light`) and the preference as
 * `data-theme-pref`.
 */
export type Theme = "dark" | "light";
export type ThemePreference = "system" | Theme;

/** What the server renders before the init script runs (and the fallback without JS). */
export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const THEME_COOKIE = "infocus-theme";
export const THEME_PREF_ATTRIBUTE = "data-theme-pref";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME_PREFERENCE;
}

export function readThemePreferenceFromCookieHeader(cookieHeader: string): ThemePreference {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  return parseThemePreference(match?.[1]);
}

/** The theme to show for a preference, given whether the device prefers light. */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): Theme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

export function buildThemeCookie(preference: ThemePreference, hostname: string, secure: boolean): string {
  const domain = resolveSessionCookieDomain(hostname);
  return [
    `${THEME_COOKIE}=${preference}`,
    "path=/",
    `max-age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    "samesite=lax",
    ...(domain ? [`domain=${domain}`] : []),
    ...(secure ? ["secure"] : [])
  ].join("; ");
}

/**
 * Runs in <head> before first paint. The server always renders class="dark"; this reads the
 * preference cookie (anything but light/dark means System), sets the class from it or from the
 * device setting, and keeps following the device while the preference is System. It re-reads
 * `data-theme-pref` on every device change, so a choice made in Settings takes effect at once.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)(?:;|$)/);d.setAttribute("${THEME_PREF_ATTRIBUTE}",m?m[1]:"system");var q=window.matchMedia?window.matchMedia("${LIGHT_QUERY}"):null;var a=function(){var p=d.getAttribute("${THEME_PREF_ATTRIBUTE}");var l=p==="light"||(p!=="dark"&&!!q&&q.matches);d.classList.toggle("light",l);d.classList.toggle("dark",!l);};a();if(q&&q.addEventListener)q.addEventListener("change",a);}catch(e){}})();`;

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  const theme = resolveTheme(preference, window.matchMedia?.(LIGHT_QUERY).matches ?? false);
  root.setAttribute(THEME_PREF_ATTRIBUTE, preference);
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  document.cookie = buildThemeCookie(preference, window.location.hostname, window.location.protocol === "https:");
}
