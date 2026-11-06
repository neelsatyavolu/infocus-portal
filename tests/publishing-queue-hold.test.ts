import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(),
  upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), listUpcomingShowDays: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { schoolCalendarDay: {
  upsert: mocks.upsert, findUnique: mocks.findUnique, update: mocks.update, deleteMany: mocks.deleteMany
} } }));
vi.mock("@/src/server/show-schedule", () => ({ listUpcomingShowDays: mocks.listUpcomingShowDays }));
import { DELETE, POST } from "@/app/api/package-cycle/queue/hold/route";

// 2026-12-11 is a Friday (a regular show day); 2026-12-15 is a Tuesday switched to a show.
const FRIDAY = "2026-12-11";
const TUESDAY = "2026-12-15";

const hold = (body: unknown) => POST(new Request("https://infocus.test/api/package-cycle/queue/hold", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
}));
const release = (date: string) => DELETE(new Request(`https://infocus.test/api/package-cycle/queue/hold?date=${date}`, { method: "DELETE" }));

describe("holding a show day in the publishing queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user");
    mocks.syncUserProfile.mockResolvedValue({ id: "user", email: "user@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "EXECUTIVE_PRODUCER" });
    mocks.listUpcomingShowDays.mockResolvedValue([
      { date: FRIDAY, kind: "SHOW", label: "" },
      { date: TUESDAY, kind: "SHOW", label: "" }
    ]);
    mocks.upsert.mockImplementation(({ create }: { create: { date: string; label: string } }) => Promise.resolve(create));
  });

  it("names the day on the calendar so auto-assign skips it", async () => {
    const response = await hold({ date: FRIDAY, label: "  Recap " });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { date: FRIDAY },
      create: { date: FRIDAY, kind: "SHOW", label: "Recap", source: "manual" },
      update: { kind: "SHOW", label: "Recap", source: "manual" }
    });
  });

  it("keeps holds to people who edit the calendar", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    expect((await hold({ date: FRIDAY, label: "Recap" })).status).toBe(403);
    expect((await release(FRIDAY)).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a day that isn't an upcoming show, or a blank name", async () => {
    expect((await hold({ date: "2026-12-12", label: "Recap" })).status).toBe(400);
    expect((await hold({ date: FRIDAY, label: "   " })).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("deletes the row a hold made on a regular show day when released", async () => {
    mocks.findUnique.mockResolvedValue({ source: "manual" });
    expect((await release(FRIDAY)).status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { date: FRIDAY } });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps a switched day a show when released, with no name", async () => {
    mocks.findUnique.mockResolvedValue({ source: "manual" });
    await release(TUESDAY);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ where: { date: TUESDAY }, data: { label: "", source: "manual" } });
  });

  it("clears a name Paly's calendar sync wrote without deleting it, so the sync can't bring it back", async () => {
    mocks.findUnique.mockResolvedValue({ source: "school-year" });
    await release(FRIDAY);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ where: { date: FRIDAY }, data: { label: "", source: "manual" } });
  });
});
