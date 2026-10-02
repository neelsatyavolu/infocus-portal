import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  studentFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  requestFindMany: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    equipmentStudent: { findMany: mocks.studentFindMany },
    equipmentItem: { findMany: mocks.itemFindMany },
    equipmentRequest: { findMany: mocks.requestFindMany }
  }
}));

import { GET } from "@/app/api/equipment/mine/route";
import { loadMyEquipment } from "@/src/server/equipment-mine";

const now = new Date("2026-10-05T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.studentFindMany.mockResolvedValue([{ id: "stu-1" }]);
  mocks.itemFindMany.mockImplementation(async ({ where }: { where: { checkedOut: boolean } }) =>
    where.checkedOut
      ? [
          { id: "cam", name: "Camera A", barcode: "CAM-1", checkedOutAt: new Date("2026-10-01T12:00:00.000Z") },
          { id: "mic", name: "Mic B", barcode: "MIC-2", checkedOutAt: new Date("2026-10-04T12:00:00.000Z") }
        ]
      : [{ id: "tri", name: "Tripod", barcode: "TRI-3" }]
  );
  mocks.requestFindMany.mockResolvedValue([
    {
      id: "req-1",
      status: "APPROVED",
      createdAt: new Date("2026-09-30T12:00:00.000Z"),
      items: [{ item: { id: "cam", name: "Camera A", barcode: "CAM-1", checkedOut: true, checkedOutById: "stu-1" } }]
    },
    {
      id: "req-2",
      status: "APPROVED",
      createdAt: new Date("2026-10-04T12:00:00.000Z"),
      items: [{ item: { id: "tri", name: "Tripod", barcode: "TRI-3", checkedOut: false, checkedOutById: null } }]
    }
  ]);
});

describe("my equipment", () => {
  it("matches the borrower by email, ignoring case", async () => {
    await loadMyEquipment(" Sage@Example.edu ", now);
    expect(mocks.studentFindMany).toHaveBeenCalledWith({
      where: { email: { equals: "Sage@Example.edu", mode: "insensitive" } },
      select: { id: true }
    });
  });

  it("gives each item out its overdue time, and marks fulfilled requests", async () => {
    const mine = await loadMyEquipment("sage@example.edu", now);
    expect(mine.overdueAfterHours).toBe(72);
    expect(mine.out).toEqual([
      { id: "cam", name: "Camera A", barcode: "CAM-1", checkedOutAt: "2026-10-01T12:00:00.000Z", dueAt: "2026-10-04T12:00:00.000Z", overdue: true },
      { id: "mic", name: "Mic B", barcode: "MIC-2", checkedOutAt: "2026-10-04T12:00:00.000Z", dueAt: "2026-10-07T12:00:00.000Z", overdue: false }
    ]);
    expect(mine.held).toEqual([{ id: "tri", name: "Tripod", barcode: "TRI-3" }]);
    expect(mine.requests.map((request) => [request.id, request.fulfilled])).toEqual([["req-1", true], ["req-2", false]]);
  });

  it("still lists requests made under the email before any checkout", async () => {
    mocks.studentFindMany.mockResolvedValue([]);
    const mine = await loadMyEquipment("otto@example.edu", now);
    expect(mine.out).toEqual([]);
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
    expect(mocks.requestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ email: { equals: "otto@example.edu", mode: "insensitive" } }] } })
    );
  });

  it("serves the signed-in person's gear and needs a session", async () => {
    mocks.requireUserId.mockResolvedValue("user-1");
    mocks.syncUserProfile.mockResolvedValue({ id: "user-1", email: "sage@example.edu" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data.out).toHaveLength(2);

    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await GET()).status).toBe(401);
  });
});
