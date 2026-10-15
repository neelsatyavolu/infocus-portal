import { describe, expect, it } from "vitest";
import { isAdminView, parseOAuthReturn, resolveInitialView, resolveTarget } from "@/app/(app)/admin/admin-views";

describe("resolveTarget", () => {
  it("maps old section ids to their view and scrolls to them", () => {
    expect(resolveTarget("#access-requests", true)).toEqual({ view: "overview", section: "access-requests" });
    expect(resolveTarget("producer-team", true)).toEqual({ view: "people", section: "producer-team" });
    expect(resolveTarget("#package-cycles", false)).toEqual({ view: "school-year", section: "package-cycles" });
    expect(resolveTarget("#configuration", false)).toEqual({ view: "school-year", section: "configuration" });
    expect(resolveTarget("#integrations", true)).toEqual({ view: "system", section: "integrations" });
    expect(resolveTarget("#backups", true)).toEqual({ view: "system", section: "backups" });
    expect(resolveTarget("#danger-zone", true)).toEqual({ view: "system", section: "danger-zone" });
  });

  it("opens a view id without scrolling", () => {
    expect(resolveTarget("#people", false)).toEqual({ view: "people", section: null });
    expect(resolveTarget("#overview", false)).toEqual({ view: "overview", section: null });
    expect(resolveTarget("#school-year", false)).toEqual({ view: "school-year", section: null });
    expect(resolveTarget("#system", true)).toEqual({ view: "system", section: null });
  });

  it("refuses System for executive producers and unknown ids", () => {
    expect(resolveTarget("#backups", false)).toBeNull();
    expect(resolveTarget("#system", false)).toBeNull();
    expect(resolveTarget("#nope", true)).toBeNull();
    expect(resolveTarget("#constructor", true)).toBeNull();
    expect(resolveTarget("", true)).toBeNull();
    expect(resolveTarget("#%E0%A4%A", true)).toBeNull();
  });
});

describe("resolveInitialView", () => {
  it("opens System for a Google sign-in return", () => {
    expect(resolveInitialView({ hash: "#people", stored: "overview", canSystem: true, oauthReturn: true })).toEqual({
      view: "system",
      section: "integrations"
    });
  });

  it("prefers the hash, then the remembered view, then Overview", () => {
    expect(resolveInitialView({ hash: "#backups", stored: "people", canSystem: true, oauthReturn: false })).toEqual({
      view: "system",
      section: "backups"
    });
    expect(resolveInitialView({ hash: "", stored: "people", canSystem: false, oauthReturn: false })).toEqual({
      view: "people",
      section: null
    });
    expect(resolveInitialView({ hash: "", stored: "system", canSystem: false, oauthReturn: false })).toEqual({
      view: "overview",
      section: null
    });
    expect(resolveInitialView({ hash: "#x", stored: 42, canSystem: true, oauthReturn: false })).toEqual({
      view: "overview",
      section: null
    });
  });

  it("ignores a sign-in return when System is not available", () => {
    expect(resolveInitialView({ hash: "", stored: null, canSystem: false, oauthReturn: true })).toEqual({
      view: "overview",
      section: null
    });
  });
});

describe("parseOAuthReturn", () => {
  it("reads both results and strips their params, keeping others", () => {
    const parsed = parseOAuthReturn("?youtube=connected&gcal=error&gcalMessage=Nope&keep=1");
    expect(parsed.youtube).toEqual({ ok: true, message: "YouTube is connected. Uploads resume on the next check." });
    expect(parsed.googleCalendar).toEqual({ ok: false, message: "Nope" });
    expect(parsed.search).toBe("keep=1");
  });

  it("falls back to a generic error and returns nulls without params", () => {
    expect(parseOAuthReturn("?youtube=error").youtube).toEqual({ ok: false, message: "Couldn't connect YouTube. Try again." });
    expect(parseOAuthReturn("?gcal=connected").googleCalendar?.ok).toBe(true);
    expect(parseOAuthReturn("")).toEqual({ youtube: null, googleCalendar: null, search: "" });
  });
});

describe("isAdminView", () => {
  it("accepts only the four views", () => {
    expect(isAdminView("overview")).toBe(true);
    expect(isAdminView("system")).toBe(true);
    expect(isAdminView("backups")).toBe(false);
    expect(isAdminView(null)).toBe(false);
  });
});
