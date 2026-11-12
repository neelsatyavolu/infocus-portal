import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import {
  pickCurrentParticipationWeek,
  snapshotPackageTotals,
  studentExtensionStatus
} from "@/src/server/dashboard-data";

describe("snapshotPackageTotals", () => {
  it("counts only graded final cuts and check-ins", () => {
    expect(snapshotPackageTotals([40, null, 50], [20, 10, null])).toEqual({
      earned: 120,
      possible: 140
    });
  });

  it("uses released check-in possible when only some stages are due", () => {
    expect(snapshotPackageTotals([null], [5], [5])).toEqual({
      earned: 5,
      possible: 5
    });
  });

  it("returns zeros when nothing is gradeable yet", () => {
    expect(snapshotPackageTotals([null, null], [null])).toEqual({
      earned: 0,
      possible: 0
    });
  });
});

describe("pickCurrentParticipationWeek", () => {
  const weeks = [{ weekStart: "2026-08-10" }, { weekStart: "2026-08-17" }, { weekStart: "2026-08-24" }];

  it("returns the week that contains today", () => {
    expect(pickCurrentParticipationWeek(weeks, "2026-08-20")).toEqual({ weekStart: "2026-08-17" });
    expect(pickCurrentParticipationWeek(weeks, "2026-08-15")).toEqual({ weekStart: "2026-08-10" });
  });

  it("falls back to the first week before participation starts", () => {
    expect(
      pickCurrentParticipationWeek(
        [{ weekStart: "2026-08-17" }, { weekStart: "2026-08-24" }],
        "2026-08-15"
      )
    ).toEqual({ weekStart: "2026-08-17" });
  });

  it("falls back to the last week after the semester ends", () => {
    expect(pickCurrentParticipationWeek(weeks, "2026-09-01")).toEqual({ weekStart: "2026-08-24" });
  });

  it("returns null when there are no weeks", () => {
    expect(pickCurrentParticipationWeek([], "2026-08-14")).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to today in Pacific time, not UTC, on the evening of a week's last day", () => {
    // Sun Aug 16, 6 PM PDT is already Mon Aug 17 in UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T01:00:00.000Z"));
    expect(pickCurrentParticipationWeek(weeks)).toEqual({ weekStart: "2026-08-10" });
  });
});

describe("studentExtensionStatus", () => {
  const grant = (overrides: Record<string, unknown> = {}) => ({
    status: "APPROVED" as const,
    requestedDays: 2,
    grantedDays: null,
    grantedUserIds: [] as string[],
    producerGranted: false,
    memberConsents: [] as Array<{ userId: string; agreed: boolean }>,
    ...overrides
  });

  it("is null when the student is on no group", () => {
    expect(studentExtensionStatus(null, "abby")).toBeNull();
  });

  it("reports the longest approved grant that covers the student", () => {
    const row = {
      extension: true,
      extensionRequests: [grant({ grantedDays: 1.5 }), grant({ grantedDays: 4, grantedUserIds: ["otto"] })]
    };
    expect(studentExtensionStatus(row, "abby")).toEqual({ approvedDays: 1.5, pending: null });
    expect(studentExtensionStatus(row, "otto")).toEqual({ approvedDays: 4, pending: null });
  });

  it("flags a pending request the student still has to agree to", () => {
    const row = {
      extension: false,
      extensionRequests: [grant({ status: "PENDING", memberConsents: [{ userId: "otto", agreed: true }] })]
    };
    expect(studentExtensionStatus(row, "abby")).toEqual({ approvedDays: 0, pending: "awaiting-you" });
    expect(studentExtensionStatus(row, "otto")).toEqual({ approvedDays: 0, pending: "pending" });
  });

  it("hides a pending partial grant from members it doesn't cover", () => {
    const row = {
      extension: false,
      extensionRequests: [grant({ status: "PENDING", producerGranted: true, grantedUserIds: ["otto"] })]
    };
    expect(studentExtensionStatus(row, "abby")).toEqual({ approvedDays: 0, pending: null });
    expect(studentExtensionStatus(row, "otto")).toEqual({ approvedDays: 0, pending: "pending" });
  });
});
