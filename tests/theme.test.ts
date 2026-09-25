import { describe, expect, it } from "vitest";
import {
  buildThemeCookie,
  DEFAULT_THEME,
  parseTheme,
  readThemeFromCookieHeader,
  THEME_INIT_SCRIPT
} from "@/src/lib/theme";

function runInitScript(cookie: string) {
  const classes = new Set(["dark"]);
  const document = {
    cookie,
    documentElement: {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name)
      }
    }
  };
  new Function("document", THEME_INIT_SCRIPT)(document);
  return [...classes];
}

describe("parseTheme", () => {
  it("defaults to dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("")).toBe("dark");
    expect(parseTheme("sepia")).toBe("dark");
  });

  it("accepts light", () => {
    expect(parseTheme("light")).toBe("light");
  });
});

describe("readThemeFromCookieHeader", () => {
  it("reads the theme cookie among others", () => {
    expect(readThemeFromCookieHeader("a=1; infocus-theme=light; b=2")).toBe("light");
    expect(readThemeFromCookieHeader("infocus-theme=dark")).toBe("dark");
  });

  it("ignores cookies whose name only ends with the theme cookie name", () => {
    expect(readThemeFromCookieHeader("x-infocus-theme=light")).toBe("dark");
  });

  it("falls back to dark when missing", () => {
    expect(readThemeFromCookieHeader("")).toBe("dark");
  });
});

describe("buildThemeCookie", () => {
  it("shares the cookie across infocuspaly.com subdomains", () => {
    expect(buildThemeCookie("light", "grades.infocuspaly.com", true)).toBe(
      "infocus-theme=light; path=/; max-age=31536000; samesite=lax; domain=.infocuspaly.com; secure"
    );
  });

  it("uses a host-only cookie locally", () => {
    expect(buildThemeCookie("dark", "localhost", false)).toBe(
      "infocus-theme=dark; path=/; max-age=31536000; samesite=lax"
    );
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("switches <html> to light when the cookie says light", () => {
    expect(runInitScript("a=1; infocus-theme=light")).toEqual(["light"]);
  });

  it("keeps dark otherwise", () => {
    expect(runInitScript("infocus-theme=dark")).toEqual(["dark"]);
    expect(runInitScript("")).toEqual(["dark"]);
    expect(runInitScript("x-infocus-theme=light")).toEqual(["dark"]);
    expect(runInitScript("infocus-theme=lightish")).toEqual(["dark"]);
  });
});
