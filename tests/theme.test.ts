import { describe, expect, it } from "vitest";
import {
  buildThemeCookie,
  DEFAULT_THEME,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  readThemePreferenceFromCookieHeader,
  resolveTheme,
  THEME_INIT_SCRIPT
} from "@/src/lib/theme";

/** Runs the head script against a fake <html> and device setting; returns the result and a way to flip the device. */
function runInitScript(cookie: string, systemPrefersLight = false) {
  const classes = new Set(["dark"]);
  const attributes = new Map<string, string>();
  const query = { matches: systemPrefersLight, listener: null as null | (() => void) };
  const document = {
    cookie,
    documentElement: {
      classList: {
        toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name))
      },
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name) ?? null
    }
  };
  const window = {
    matchMedia: () => ({
      get matches() {
        return query.matches;
      },
      addEventListener: (_type: string, listener: () => void) => {
        query.listener = listener;
      }
    })
  };
  new Function("document", "window", THEME_INIT_SCRIPT)(document, window);
  return {
    classes: () => [...classes].sort(),
    preference: () => attributes.get("data-theme-pref"),
    setSystemLight: (light: boolean) => {
      query.matches = light;
      query.listener?.();
    }
  };
}

describe("parseThemePreference", () => {
  it("defaults to system", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("accepts light and dark", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("follows the device for system", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  it("keeps an explicit choice whatever the device says", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });
});

describe("readThemePreferenceFromCookieHeader", () => {
  it("reads the theme cookie among others", () => {
    expect(readThemePreferenceFromCookieHeader("a=1; infocus-theme=light; b=2")).toBe("light");
    expect(readThemePreferenceFromCookieHeader("infocus-theme=dark")).toBe("dark");
    expect(readThemePreferenceFromCookieHeader("infocus-theme=system")).toBe("system");
  });

  it("ignores cookies whose name only ends with the theme cookie name", () => {
    expect(readThemePreferenceFromCookieHeader("x-infocus-theme=light")).toBe("system");
  });

  it("falls back to system when missing", () => {
    expect(readThemePreferenceFromCookieHeader("")).toBe("system");
  });
});

describe("buildThemeCookie", () => {
  it("shares the cookie across infocuspaly.com subdomains", () => {
    expect(buildThemeCookie("light", "grades.infocuspaly.com", true)).toBe(
      "infocus-theme=light; path=/; max-age=31536000; samesite=lax; domain=.infocuspaly.com; secure"
    );
  });

  it("uses a host-only cookie locally", () => {
    expect(buildThemeCookie("system", "localhost", false)).toBe(
      "infocus-theme=system; path=/; max-age=31536000; samesite=lax"
    );
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("renders dark on the server", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("follows the device with no cookie", () => {
    const light = runInitScript("", true);
    expect(light.classes()).toEqual(["light"]);
    expect(light.preference()).toBe("system");
    expect(runInitScript("", false).classes()).toEqual(["dark"]);
  });

  it("switches live when the device changes and the preference is system", () => {
    const page = runInitScript("infocus-theme=system", false);
    expect(page.classes()).toEqual(["dark"]);
    page.setSystemLight(true);
    expect(page.classes()).toEqual(["light"]);
  });

  it("keeps an explicit choice when the device changes", () => {
    const dark = runInitScript("a=1; infocus-theme=dark", true);
    expect(dark.classes()).toEqual(["dark"]);
    expect(dark.preference()).toBe("dark");
    const light = runInitScript("infocus-theme=light", false);
    light.setSystemLight(false);
    expect(light.classes()).toEqual(["light"]);
  });

  it("treats unknown values and look-alike cookie names as system", () => {
    expect(runInitScript("infocus-theme=lightish", false).classes()).toEqual(["dark"]);
    expect(runInitScript("x-infocus-theme=light", false).classes()).toEqual(["dark"]);
    expect(runInitScript("x-infocus-theme=light", true).classes()).toEqual(["light"]);
  });
});
