import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: vi.fn(), deletions: vi.fn(), upsert: vi.fn(), sheet: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  announcementSubmission: { findMany: mocks.native },
  submittedAnnouncementDeletion: { findMany: mocks.deletions, upsert: mocks.upsert }
} }));
vi.mock("@/src/lib/submitted-announcements", () => ({ fetchSubmittedAnnouncementsFromGoogleSheet: mocks.sheet }));
import { fetchSubmittedAnnouncements, deleteSubmittedAnnouncement } from "@/src/server/announcement-submissions";

const sheetEntry = {
  id: "sheet-row-2", rowNumber: 2, timestamp: "9/10/2026", email: "sender@example.com", name: "Sender",
  announcement: "Club meeting", startDate: "2026-09-10", endDate: "2026-09-11", source: "google-sheets"
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.native.mockResolvedValue([]);
  mocks.deletions.mockResolvedValue([]);
  mocks.sheet.mockResolvedValue({ announcements: [sheetEntry], meta: { spreadsheetId: "sheet", totalRows: 1 } });
});
describe("submitted announcement deletion", () => {
  it("keeps a deleted sheet submission hidden after its row moves", async () => {
    const first = await fetchSubmittedAnnouncements();
    const id = first.announcements[0].id;
    await deleteSubmittedAnnouncement(id);
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { id }, create: { id }, update: {} });
    mocks.deletions.mockResolvedValue([{ id }]);
    mocks.sheet.mockResolvedValue({ announcements: [{ ...sheetEntry, id: "sheet-row-8", rowNumber: 8 }], meta: { spreadsheetId: "sheet", totalRows: 1 } });
    expect((await fetchSubmittedAnnouncements()).announcements).toEqual([]);
  });
  it("does not delete an unknown submission", async () => {
    await expect(deleteSubmittedAnnouncement("unknown")).rejects.toThrow("NOT_FOUND");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("keeps active native submissions available when the sheet is unavailable", async () => {
    mocks.sheet.mockRejectedValue(new Error("offline"));
    mocks.native.mockResolvedValue([{ ...sheetEntry, id: "native-1", isPermanent: true, createdAt: new Date("2026-09-10T19:00:00Z") }]);
    expect((await fetchSubmittedAnnouncements()).announcements[0]).toMatchObject({ id: "native-1", isPermanent: true });
    mocks.deletions.mockResolvedValue([{ id: "native-1" }]);
    expect((await fetchSubmittedAnnouncements()).announcements).toEqual([]);
  });
});
