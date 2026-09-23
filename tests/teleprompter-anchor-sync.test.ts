import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultTeleprompterSections } from "@/src/lib/teleprompter-template";

const db = vi.hoisted(() => ({
  teleprompterDoc: { findMany: vi.fn() },
  masterCalendarEntry: { findMany: vi.fn(), findUnique: vi.fn() },
  workspaceMember: { findMany: vi.fn().mockResolvedValue([]) },
  user: { findMany: vi.fn() },
  teleprompterSection: { updateMany: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
import { resolveAnchorAssignments, syncTeleprompterAnchorNames } from "@/src/server/teleprompter-anchors";

beforeEach(() => vi.clearAllMocks());

describe("saved teleprompter anchor synchronization", () => {
  it("uses registered users without workspace membership for full names and calendar reassignment", async () => {
    const showDate = new Date("2026-09-09T12:00:00Z");
    const sections = buildDefaultTeleprompterSections({ showDate, a2BulletinContent: "Edited bulletin", anchorName: "Alex", coanchorName: "Jordan" })
      .filter((section) => section.label === "A1" || section.label === "A5")
      .map((section) => ({ ...section, id: section.label }));
    db.teleprompterDoc.findMany.mockResolvedValue([{ workspaceId: "workspace", showDate, sections }]);
    db.masterCalendarEntry.findMany.mockResolvedValue([{ date: "2026-09-09", content: "<p>Anchors:</p><p>Alex / Jordan</p>" }]);
    db.user.findMany.mockResolvedValue([
      { name: "Alex Kim", nickname: "Alex" },
      { name: "Jordan Lee", nickname: "Jordan" },
      { name: "Taylor Smith", nickname: "Tay" }
    ]);
    db.teleprompterSection.updateMany.mockImplementation(async ({ where, data }) => {
      const section = sections.find((section) => section.id === where.id)!;
      expect(where.content).toBe(section.content);
      section.content = data.content;
      return { count: 1 };
    });
    await syncTeleprompterAnchorNames({ workspaceId: "workspace" });
    expect(sections[0].content).toContain("I'm Alex Kim.");
    expect(sections[1].content).toContain("Until next time, I'm Jordan Lee.");
    db.teleprompterSection.updateMany.mockClear();
    await syncTeleprompterAnchorNames({ workspaceId: "workspace" });
    expect(db.teleprompterSection.updateMany).not.toHaveBeenCalled();
    db.masterCalendarEntry.findMany.mockResolvedValue([{ date: "2026-09-09", content: "<p>Anchors:</p><p>Tay / Alex</p>" }]);
    await syncTeleprompterAnchorNames({ dateKey: "2026-09-09" });
    expect(sections[0].content).toContain("I'm Taylor Smith.");
    expect(sections[1].content).toContain("Until next time, I'm Alex Kim.");
    expect(db.teleprompterDoc.findMany.mock.lastCall?.[0].where.showDate).toEqual(showDate);
  });

  it("does no roster work when there are no saved show documents", async () => {
    db.teleprompterDoc.findMany.mockResolvedValue([]);
    await syncTeleprompterAnchorNames({ dateKey: "2026-09-09" });
    expect(db.masterCalendarEntry.findMany).not.toHaveBeenCalled();
    expect(db.workspaceMember.findMany).not.toHaveBeenCalled();
  });
});


it("resolves both anchors from dashboard users when creating a show", async () => {
  db.masterCalendarEntry.findUnique.mockResolvedValue({ content: "<p>Anchors:</p><p>Alma / Colin</p>" });
  db.user.findMany.mockResolvedValue([{ name: "Alma Marsh", nickname: null }, { name: "Colin Baker", nickname: null }]);
  expect(await resolveAnchorAssignments({ workspaceId: "workspace", showDate: new Date("2026-09-09T12:00:00Z") }))
    .toEqual({ anchorName: "Alma Marsh", coanchorName: "Colin Baker" });
  expect(db.workspaceMember.findMany).not.toHaveBeenCalled();
});
