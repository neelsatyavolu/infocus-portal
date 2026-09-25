import { resolveSessionCookieDomain } from "@/src/lib/hosts";

/**
 * Color theme preference. Dark is the default; Light is opt-in from Settings.
 * Stored in a cookie on .infocuspaly.com so the Portal subdomains (grades,
 * teleprompter, equipment) share the choice.
 */
export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "infocus-theme";

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : DEFAULT_THEME;
}

export function readThemeFromCookieHeader(cookieHeader: string): Theme {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  return parseTheme(match?.[1]);
}

export function buildThemeCookie(theme: Theme, hostname: string, secure: boolean): string {
  const domain = resolveSessionCookieDomain(hostname);
  return [
    `${THEME_COOKIE}=${theme}`,
    "path=/",
    `max-age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    "samesite=lax",
    ...(domain ? [`domain=${domain}`] : []),
    ...(secure ? ["secure"] : [])
  ].join("; ");
}

/**
 * Runs in <head> before first paint. The server always renders class="dark";
 * this swaps it for "light" when the cookie says so, so there is no flash.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=light(?:;|$)/);if(m){var c=document.documentElement.classList;c.remove("dark");c.add("light");}}catch(e){}})();`;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  document.cookie = buildThemeCookie(theme, window.location.hostname, window.location.protocol === "https:");
}
