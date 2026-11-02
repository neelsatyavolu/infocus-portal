"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  THEME_PREF_ATTRIBUTE,
  type Theme,
  type ThemePreference
} from "@/src/lib/theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", THEME_PREF_ATTRIBUTE] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

function getPreferenceSnapshot(): ThemePreference {
  return parseThemePreference(document.documentElement.getAttribute(THEME_PREF_ATTRIBUTE));
}

function getPreferenceServerSnapshot(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

/** Current theme shown (dark or light), read from the <html> class so every caller stays in sync. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The saved preference (System, Light or Dark), read from <html data-theme-pref>. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getPreferenceSnapshot, getPreferenceServerSnapshot);
}
