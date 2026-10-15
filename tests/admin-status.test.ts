import { describe, expect, it } from "vitest";
import {
  backupHealth,
  calendarSyncHealth,
  googleCalendarHealth,
  googleCalendarStatusLine,
  headerContextItems,
  health,
  systemNeedsAttention,
  youtubeHealth,
  youtubeStatusLine,
  type AdminHealth
} from "@/app/(app)/admin/admin-status";
import { formatWhen } from "@/app/(app)/admin/admin-types";

const youtube = {
  connected: true,
  source: "admin" as const,
  channelTitle: "InFocus",
  connectedAt: "2026-09-02T17:00:00Z",
  lastCheckOk: true,
  message: null
};

describe("youtubeHealth", () => {
  it("covers loading, failed check, connected, not connected and expired", () => {
    expect(youtubeHealth({ state: "loading" })).toMatchObject({ code: "checking", tone: "neutral", label: "Checking" });
    expect(youtubeHealth({ state: "error" })).toMatchObject({ code: "unknown", detail: "Couldn't check" });
    expect(youtubeHealth({ state: "ready", data: youtube })).toMatchObject({ code: "connected", tone: "ok" });
    expect(youtubeHealth({ state: "ready", data: { ...youtube, connectedAt: null } }).detail).toBe("InFocus · set by environment");
    expect(youtubeHealth({ state: "ready", data: { ...youtube, connected: false, source: "none" } })).toMatchObject({
      code: "not-connected",
      tone: "danger"
    });
    expect(
      youtubeHealth({ state: "ready", data: { ...youtube, connected: false, message: "Token revoked" } })
    ).toMatchObject({ code: "expired", tone: "danger", label: "Expired", detail: "Token revoked" });
  });
});

describe("googleCalendarHealth", () => {
  const base = { connected: true, accountEmail: "studio@example.edu", connectedAt: null, lastSyncedAt: null, lastSyncError: null };
  it("separates not connected, sync failed and connected", () => {
    expect(googleCalendarHealth({ state: "ready", data: { ...base, connected: false } }).code).toBe("not-connected");
    expect(googleCalendarHealth({ state: "ready", data: { ...base, lastSyncError: "403" } })).toMatchObject({
      code: "sync-failed",
      detail: "403"
    });
    expect(googleCalendarHealth({ state: "ready", data: base })).toMatchObject({ code: "connected", detail: "studio@example.edu" });
    expect(googleCalendarHealth({ state: "ready", data: { ...base, lastSyncedAt: "2026-10-14T22:05:00Z" } }).detail).toMatch(
      /^Last synced /
    );
  });
});

describe("backupHealth", () => {
  it("covers not set up, no backups, ok and failed", () => {
    expect(backupHealth({ state: "ready", data: { configured: false } }).code).toBe("not-set-up");
    expect(backupHealth({ state: "ready", data: { configured: true, latest: null, dumps: [] } })).toMatchObject({
      code: "no-backups",
      label: "No backups yet",
      tone: "neutral"
    });
    const ok = backupHealth({
      state: "ready",
      data: { configured: true, latest: { ok: true, at: "2026-10-14T22:05:00Z", key: "k", bytes: 2_500_000, error: null }, dumps: [] }
    });
    expect(ok).toMatchObject({ code: "ok", tone: "ok" });
    expect(ok.detail).toContain("2.50 MB");
    expect(
      backupHealth({
        state: "ready",
        data: { configured: true, latest: { ok: false, at: "2026-10-14T22:05:00Z", key: null, bytes: null, error: "R2 down" }, dumps: [] }
      })
    ).toMatchObject({ code: "failed", tone: "danger", detail: "R2 down" });
    expect(backupHealth({ state: "error" }).code).toBe("unknown");
  });
});

describe("calendarSyncHealth", () => {
  it("covers not checked, ok and failed", () => {
    expect(calendarSyncHealth({ state: "ready", data: null }).code).toBe("not-checked");
    expect(calendarSyncHealth({ state: "ready", data: { at: "2026-10-14T22:05:00Z", ok: true, finalsDates: [], message: "" } }).code).toBe(
      "ok"
    );
    expect(
      calendarSyncHealth({ state: "ready", data: { at: "2026-10-14T22:05:00Z", ok: false, finalsDates: [], message: "Feed down" } })
    ).toMatchObject({ code: "failed", detail: "Feed down" });
  });
});

describe("headerContextItems and systemNeedsAttention", () => {
  const quiet: AdminHealth = {
    youtube: health("connected"),
    googleCalendar: health("connected"),
    backups: health("ok"),
    calendarSync: health("ok")
  };

  it("is empty when nothing needs anyone", () => {
    expect(headerContextItems(0, quiet)).toEqual({ shown: [], more: 0 });
    expect(systemNeedsAttention(quiet)).toBe(false);
  });

  it("lists access requests first, shows two, and counts the rest", () => {
    const busy: AdminHealth = {
      youtube: health("expired"),
      googleCalendar: health("sync-failed"),
      backups: health("failed"),
      calendarSync: health("failed")
    };
    const result = headerContextItems(1, busy);
    expect(result.shown.map((item) => item.label)).toEqual(["1 access request waiting", "YouTube uploads paused"]);
    expect(result.shown.map((item) => item.target)).toEqual(["access-requests", "integrations"]);
    expect(result.more).toBe(3);
    expect(systemNeedsAttention(busy)).toBe(true);
  });

  it("gives executive producers only the calendar check", () => {
    const ep: AdminHealth = { youtube: null, googleCalendar: null, backups: null, calendarSync: health("failed") };
    expect(headerContextItems(3, ep).shown.map((item) => item.label)).toEqual([
      "3 access requests waiting",
      "Paly's calendar check failed"
    ]);
    expect(systemNeedsAttention(ep)).toBe(false);
  });

  it("does not raise neutral states", () => {
    const neutral: AdminHealth = {
      youtube: health("checking"),
      googleCalendar: health("unknown"),
      backups: health("no-backups"),
      calendarSync: health("not-checked")
    };
    expect(headerContextItems(0, neutral).shown).toEqual([]);
    expect(systemNeedsAttention(neutral)).toBe(false);
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("drops the year for this year and keeps it otherwise", () => {
    expect(formatWhen("2026-10-14T22:05:00Z", { now, timeZone: "UTC" })).toBe("Oct 14, 10:05 PM");
    expect(formatWhen("2025-12-30T09:00:00Z", { now, timeZone: "UTC" })).toBe("Dec 30, 2025, 9:00 AM");
    expect(formatWhen("not a date", { now })).toBe("—");
  });
});

describe("integration card lines share the strip's wording", () => {
  it("words YouTube the same way as its health detail", () => {
    expect(youtubeStatusLine({ state: "ready", data: { ...youtube, connectedAt: null } })).toBe("Connected as InFocus · set by environment");
    expect(youtubeStatusLine({ state: "ready", data: { ...youtube, connected: false, source: "none" } })).toBe(
      "Not connected. Uploads to YouTube are paused."
    );
    expect(youtubeStatusLine({ state: "error" })).toBe("Couldn't check the YouTube connection.");
  });

  it("words Google Calendar the same way as its health detail", () => {
    const base = { connected: false, accountEmail: null, connectedAt: null, lastSyncedAt: null, lastSyncError: "invalid_grant" };
    expect(googleCalendarStatusLine({ state: "ready", data: base })).toBe("Not connected. Meetings send no calendar invites.");
    expect(googleCalendarHealth({ state: "ready", data: base }).detail).toBe("Meetings send no calendar invites.");
    expect(
      googleCalendarStatusLine({ state: "ready", data: { ...base, connected: true, accountEmail: "studio@example.edu" } })
    ).toBe("Invites are sent from studio@example.edu");
  });
});
