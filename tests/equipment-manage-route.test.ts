import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  itemFindMany: vi.fn(),
  managerFindUnique: vi.fn(),
  managerFindMany: vi.fn(),
  managerUpsert: vi.fn(),
  managerDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  settingFindFirst: vi.fn(),
  settingUpdate: vi.fn(),
  settingCreate: vi.fn(),
  forceReturn: vi.fn(),
  releaseHold: vi.fn(),
  approveRequest: vi.fn(),
  denyRequest: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return {
    ...actual,
    getPlatformAccess: mocks.getPlatformAccess
  };
});

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    equipmentItem: {
      findMany: mocks.itemFindMany
    },
    equipmentManager: {
      findUnique: mocks.managerFindUnique,
      findMany: mocks.managerFindMany,
      upsert: mocks.managerUpsert,
      deleteMany: mocks.managerDeleteMany
    },
    equipmentSetting: {
      findFirst: mocks.settingFindFirst,
      update: mocks.settingUpdate,
      create: mocks.settingCreate
    },
    user: {
      findUnique: mocks.userFindUnique
    }
  }
}));

vi.mock("@/src/server/equipment-inventory", () => ({
  forceReturn: mocks.forceReturn,
  releaseHold: mocks.releaseHold
}));

vi.mock("@/src/server/equipment-requests", () => ({
  approveRequest: mocks.approveRequest,
  denyRequest: mocks.denyRequest
}));

import { GET as getManageItems } from "@/app/api/equipment/manage/items/route";
import { POST as appointManager } from "@/app/api/equipment/manage/managers/route";
import { GET as getOut, PATCH as patchOut } from "@/app/api/equipment/manage/out/route";
import { POST as decideRequest } from "@/app/api/equipment/manage/requests/route";
import { POST as setPasscode } from "@/app/api/equipment/manage/settings/route";

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("equipment manage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      set: mocks.cookieSet,
      delete: mocks.cookieDelete
    });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.requireUserId.mockResolvedValue("user_1");
    mocks.syncUserProfile.mockResolvedValue({ id: "user_1", email: "producer@infocus.test" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.managerFindUnique.mockResolvedValue(null);
    mocks.itemFindMany.mockResolvedValue([]);
  });

  it("returns 401 for manage items GET with no session", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await getManageItems();

    expect(response.status).toBe(401);
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a class member who is not appointed", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.managerFindUnique.mockResolvedValue(null);

    const response = await getManageItems();

    expect(response.status).toBe(403);
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
  });

  it("returns 200 for a producer", async () => {
    const response = await getManageItems();

    expect(response.status).toBe(200);
    expect(mocks.itemFindMany).toHaveBeenCalled();
  });

  it("returns 200 for an appointed manager", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.managerFindUnique.mockResolvedValue({ id: "em_1" });

    const response = await getManageItems();

    expect(response.status).toBe(200);
    expect(mocks.itemFindMany).toHaveBeenCalled();
  });

  it("shows SD card declarations for current checkouts without guessing for older loans or holds", async () => {
    mocks.itemFindMany.mockResolvedValue([
      { id: "with-card", checkedOut: true, checkouts: [{ metadata: { tookSdCard: true, batchId: "batch-1" } }] },
      { id: "without-card", checkedOut: true, checkouts: [{ metadata: { tookSdCard: false } }] },
      { id: "legacy", checkedOut: true, checkouts: [{ metadata: null }] },
      { id: "held", checkedOut: false, checkouts: [] }
    ]);
    const response = await getOut();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items.map((item: { tookSdCard: boolean | null }) => item.tookSdCard)).toEqual([true, false, null, null]);
    expect(mocks.itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        checkouts: {
          where: { status: "CHECKED_OUT" }, orderBy: { checkoutAt: "desc" }, take: 1, select: { metadata: true }
        }
      })
    }));
  });

  it("lets a producer appoint a manager", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user_2",
      name: "Sam",
      nickname: null,
      email: "sam@pausd.us"
    });
    mocks.managerUpsert.mockResolvedValue({
      id: "em_2",
      userId: "user_2",
      user: { id: "user_2", name: "Sam", nickname: null, email: "sam@pausd.us" },
      createdAt: new Date("2026-09-01T00:00:00.000Z")
    });

    const response = await appointManager(
      jsonRequest("https://infocus.test/api/equipment/manage/managers", { userId: "user_2" })
    );

    expect(response.status).toBe(201);
    expect(mocks.managerUpsert).toHaveBeenCalled();
  });

  it("forbids an appointed student from appointing managers", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.managerFindUnique.mockResolvedValue({ id: "em_1" });

    const response = await appointManager(
      jsonRequest("https://infocus.test/api/equipment/manage/managers", { userId: "user_2" })
    );

    expect(response.status).toBe(403);
    expect(mocks.managerUpsert).not.toHaveBeenCalled();
  });

  it("force-returns with a manager session and no station cookie", async () => {
    mocks.forceReturn.mockResolvedValue({ action: "return", item: { id: "item_1" } });

    const response = await patchOut(
      jsonRequest(
        "https://infocus.test/api/equipment/manage/out",
        { action: "force-return", itemId: "item_1" },
        "PATCH"
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.forceReturn).toHaveBeenCalledWith("item_1");
    expect(mocks.requireUserId).toHaveBeenCalled();
    expect(mocks.cookieGet).not.toHaveBeenCalled();
  });

  it("releases a hold with a manager session and no station cookie", async () => {
    mocks.releaseHold.mockResolvedValue({ id: "item_1", onHoldForStudentId: null });

    const response = await patchOut(
      jsonRequest(
        "https://infocus.test/api/equipment/manage/out",
        { action: "release-hold", itemId: "item_1" },
        "PATCH"
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.releaseHold).toHaveBeenCalledWith("item_1");
    expect(mocks.requireUserId).toHaveBeenCalled();
    expect(mocks.cookieGet).not.toHaveBeenCalled();
  });

  it("returns 409 when approve is blocked because an item is held", async () => {
    mocks.approveRequest.mockRejectedValue(new Error("CONFLICT"));

    const response = await decideRequest(
      jsonRequest("https://infocus.test/api/equipment/manage/requests", {
        id: "req_1",
        action: "approve"
      })
    );

    expect(response.status).toBe(409);
    expect(mocks.approveRequest).toHaveBeenCalledWith("req_1");
  });

  it("retires passcode configuration", async () => {
    expect((await setPasscode()).status).toBe(410);
    expect(mocks.settingUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when deny-after-approve is a conflict", async () => {
    mocks.denyRequest.mockRejectedValue(new Error("CONFLICT"));

    const response = await decideRequest(
      jsonRequest("https://infocus.test/api/equipment/manage/requests", {
        id: "req_1",
        action: "deny"
      })
    );

    expect(response.status).toBe(409);
    expect(mocks.denyRequest).toHaveBeenCalledWith("req_1");
  });
});
