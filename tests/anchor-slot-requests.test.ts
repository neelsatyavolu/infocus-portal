import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: vi.fn() }));
vi.mock("@/src/server/push-notify", () => ({ sendPushToUserIds: vi.fn() }));
vi.mock("@/src/server/show-manager", () => ({ findShowManagerEmail: vi.fn(), resolveShowManagers: vi.fn() }));
vi.mock("@/src/server/master-calendar-sync", () => ({ markMasterCalendarEdited: vi.fn() }));

const { anchorsAfterRequest, isLateAnchorNotice, showNoticeDeadline } = await import("@/src/server/anchor-slot-requests");

describe("anchor request notice (Pacific)", () => {
  it("measures to 12:00 AM Pacific on the show day", () => {
    // Nov 13, 2026 is PST (UTC-8).
    expect(showNoticeDeadline("2026-11-13").toISOString()).toBe("2026-11-13T08:00:00.000Z");
    // Sep 11, 2026 is PDT (UTC-7).
    expect(showNoticeDeadline("2026-09-11").toISOString()).toBe("2026-09-11T07:00:00.000Z");
  });

  it("flags requests under 48 hours as late", () => {
    expect(isLateAnchorNotice("2026-11-13", new Date("2026-11-11T08:00:00.000Z"))).toBe(false);
    expect(isLateAnchorNotice("2026-11-13", new Date("2026-11-11T08:00:01.000Z"))).toBe(true);
    expect(isLateAnchorNotice("2026-11-13", new Date("2026-11-09T20:00:00.000Z"))).toBe(false);
  });
});

describe("anchorsAfterRequest", () => {
  it("puts the classmate in the requester's slot on a swap", () => {
    expect(anchorsAfterRequest(["Abby", "Otto"], 1, "SWAP", "Sage")).toEqual(["Abby", "Sage"]);
  });

  it("empties the requester's slot on a drop", () => {
    expect(anchorsAfterRequest(["Abby", "Otto"], 0, "DROP", null)).toEqual(["Otto"]);
  });

  it("needs a classmate for a swap", () => {
    expect(() => anchorsAfterRequest(["Abby"], 0, "SWAP", null)).toThrow();
  });
});
