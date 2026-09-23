import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  participationEntry: { findMany: vi.fn() },
  schoolCalendarDay: { findMany: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
import { loadGradeEditorParticipation } from "@/src/server/grade-editor-participation";

describe("Grade Editor participation", () => {
  it("keeps students separate, excludes current-week entries and respects school calendar overrides", async () => {
    db.participationEntry.findMany.mockResolvedValue([
      { userId: "a", date: new Date("2026-09-01T00:00:00Z"), points: 15 },
      { userId: "a", date: new Date("2026-09-03T00:00:00Z"), points: 20 },
      { userId: "a", date: new Date("2026-09-08T00:00:00Z"), points: 20 },
      { userId: "b", date: new Date("2026-09-01T00:00:00Z"), points: 0 }
    ]);
    db.schoolCalendarDay.findMany.mockResolvedValue([{ date: "2026-09-03", kind: "HOLIDAY" }]);
    const totals = await loadGradeEditorParticipation(["a", "b", "c"], new Date("2026-09-11T20:00:00Z"));
    expect(totals.get("a")).toEqual({ earned: 15, possible: 20 });
    expect(totals.get("b")).toEqual({ earned: 0, possible: 20 });
    expect(totals.get("c")).toEqual({ earned: 0, possible: 0 });
    expect(db.participationEntry.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["a", "b", "c"] },
        date: { gte: new Date("2026-08-13T00:00:00Z"), lte: new Date("2026-12-18T23:59:59.999Z") }
      },
      select: { userId: true, date: true, points: true }
    });
  });
});
