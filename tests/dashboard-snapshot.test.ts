import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import { pickCurrentParticipationWeek, snapshotPackageTotals } from "@/src/server/dashboard-data";

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
});
