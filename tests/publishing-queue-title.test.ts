import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(),
  findUnique: vi.fn(), rowUpdate: vi.fn(), mediaUpdate: vi.fn(), transaction: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findUnique: mocks.findUnique, update: mocks.rowUpdate },
    mediaItem: { update: mocks.mediaUpdate },
    $transaction: mocks.transaction
  }
}));
vi.mock("@/src/server/show-schedule", () => ({ listUpcomingShowDays: vi.fn() }));
import { PUT } from "@/app/api/package-cycle/queue/[rowId]/title/route";

const save = (title: unknown, rowId = "row-1") => PUT(
  new Request(`https://infocus.test/api/package-cycle/queue/${rowId}/title`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title })
  }),
  { params: Promise.resolve({ rowId }) }
);

const CUSTOM_ROW = { cycleNumber: 0, groupType: "CUSTOM_QUEUE", finalCutMediaItemId: "media-1" };

describe("renaming a custom publishing-queue package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user");
    mocks.syncUserProfile.mockResolvedValue({ id: "user", email: "user@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.findUnique.mockResolvedValue(CUSTOM_ROW);
    mocks.rowUpdate.mockImplementation(({ data }: { data: { groupTopic: string } }) => data);
    mocks.mediaUpdate.mockImplementation(({ data }: { data: { title: string } }) => data);
    mocks.transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it("renames the row and its video", async () => {
    const response = await save("  Flea Market  ");
    expect(response.status).toBe(200);
    expect(mocks.rowUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "row-1" }, data: { groupTopic: "Flea Market" } }));
    expect(mocks.mediaUpdate).toHaveBeenCalledWith({ where: { id: "media-1" }, data: { title: "Flea Market" } });
    expect((await response.json()).data).toEqual({ title: "Flea Market" });
  });

  it("rejects blank, overlong and angle-bracket titles", async () => {
    expect((await save("   ")).status).toBe(400);
    expect((await save("a".repeat(151))).status).toBe(400);
    expect((await save("<b>Hi</b>")).status).toBe(400);
    expect(mocks.rowUpdate).not.toHaveBeenCalled();
  });

  it("only renames custom packages", async () => {
    mocks.findUnique.mockResolvedValue({ ...CUSTOM_ROW, cycleNumber: 3, groupType: "PACKAGE" });
    expect((await save("New name")).status).toBeGreaterThanOrEqual(400);
    expect(mocks.rowUpdate).not.toHaveBeenCalled();
  });

  it("is for producers only", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    expect((await save("New name")).status).toBe(403);
    expect(mocks.rowUpdate).not.toHaveBeenCalled();
  });
});
