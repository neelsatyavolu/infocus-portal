import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getRealSessionUser: vi.fn(),
  getSessionUser: vi.fn(),
  getPlatformAccess: vi.fn(),
  loadManagerRosters: vi.fn(),
  getVaultActor: vi.fn(),
  canControlViewAs: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile,
  getRealSessionUser: mocks.getRealSessionUser,
  getSessionUser: mocks.getSessionUser
}));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformAccess: mocks.getPlatformAccess }));
vi.mock("@/src/server/manager-rosters", () => ({ loadManagerRosters: mocks.loadManagerRosters }));
vi.mock("@/src/server/password-vault", () => ({ getVaultActor: mocks.getVaultActor }));
vi.mock("@/src/lib/view-as", () => ({ canControlViewAs: mocks.canControlViewAs }));

import { GET as getManagers } from "@/app/api/managers/route";
import { GET as getViewAsStatus } from "@/app/api/auth/view-as/status/route";
import { GET as getVaultAccess } from "@/app/api/vault/access/route";

const abby = { userId: "abby", email: "abby@example.edu", name: "Abby", provider: "email", providerUserId: "abby" };
const otto = { userId: "otto", email: "otto@example.edu", name: "Otto", provider: "email", providerUserId: "abby" };
const emptyRosters = () => ({ equipment: [], livestreams: [], website: [], "social-media": [] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/managers", () => {
  it("refuses a signed-out caller", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await getManagers()).status).toBe(401);
    expect(mocks.loadManagerRosters).not.toHaveBeenCalled();
  });

  it("returns every area with its people and the areas this member manages", async () => {
    mocks.requireUserId.mockResolvedValue("abby");
    mocks.syncUserProfile.mockResolvedValue({ id: "abby", email: "abby@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ canManageWorkspaces: false });
    mocks.loadManagerRosters.mockResolvedValue({ ...emptyRosters(), equipment: [{ userId: "abby", name: "Abby" }] });

    const response = await getManagers();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const { data } = await response.json();
    expect(data.isProducer).toBe(false);
    expect(data.yourAreas).toEqual(["equipment"]);
    expect(data.areas.map((area: { id: string }) => area.id)).toEqual(["equipment", "livestreams", "website", "social-media"]);
    expect(data.areas[0]).toMatchObject({ id: "equipment", canOpen: true, yours: true, people: [{ userId: "abby", name: "Abby" }] });
    expect(data.areas[0].href).toBe("/equipment/manage");
    expect(data.areas[2]).toMatchObject({ id: "website", canOpen: false, yours: false, people: [] });
  });

  it("lets a producer open every area without being appointed", async () => {
    mocks.requireUserId.mockResolvedValue("sage");
    mocks.syncUserProfile.mockResolvedValue({ id: "sage", email: "sage@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ canManageWorkspaces: true });
    mocks.loadManagerRosters.mockResolvedValue(emptyRosters());
    const { data } = await (await getManagers()).json();
    expect(data.isProducer).toBe(true);
    expect(data.yourAreas).toEqual([]);
    expect(data.areas.every((area: { canOpen: boolean }) => area.canOpen)).toBe(true);
  });
});

describe("GET /api/auth/view-as/status", () => {
  it("refuses a signed-out caller", async () => {
    mocks.getRealSessionUser.mockResolvedValue(null);
    expect((await getViewAsStatus()).status).toBe(401);
  });

  it("reports View as off and not allowed for an ordinary member", async () => {
    mocks.getRealSessionUser.mockResolvedValue(abby);
    mocks.getSessionUser.mockResolvedValue(abby);
    mocks.canControlViewAs.mockReturnValue(false);
    const response = await getViewAsStatus();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data).toEqual({
      active: false,
      allowed: false,
      realUser: { id: "abby", name: "Abby", email: "abby@example.edu" },
      actingAs: null
    });
    expect(mocks.canControlViewAs).toHaveBeenCalledWith("abby@example.edu");
  });

  it("reports who is being viewed when View as is on", async () => {
    mocks.getRealSessionUser.mockResolvedValue(abby);
    mocks.getSessionUser.mockResolvedValue(otto);
    mocks.canControlViewAs.mockReturnValue(true);
    expect((await (await getViewAsStatus()).json()).data).toEqual({
      active: true,
      allowed: true,
      realUser: { id: "abby", name: "Abby", email: "abby@example.edu" },
      actingAs: { id: "otto", name: "Otto", email: "otto@example.edu" }
    });
  });
});

describe("GET /api/vault/access", () => {
  it("refuses a signed-out caller", async () => {
    mocks.getRealSessionUser.mockResolvedValue(null);
    expect((await getVaultAccess()).status).toBe(401);
    expect(mocks.getVaultActor).not.toHaveBeenCalled();
  });

  it("reports none when the page would deny access", async () => {
    mocks.getRealSessionUser.mockResolvedValue(abby);
    mocks.getVaultActor.mockResolvedValue(null);
    const response = await getVaultAccess();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ level: "none", canShare: false, canDeleteAny: false });
  });

  it("reports shared access for someone a login was shared with", async () => {
    mocks.getRealSessionUser.mockResolvedValue(abby);
    mocks.getVaultActor.mockResolvedValue({ userId: "abby", access: "shared", canShare: false, canDeleteAny: false });
    expect((await (await getVaultAccess()).json()).data).toEqual({ level: "shared", canShare: false, canDeleteAny: false });
  });

  it("reports full access with an executive's extra rights", async () => {
    mocks.getRealSessionUser.mockResolvedValue(abby);
    mocks.getVaultActor.mockResolvedValue({ userId: "abby", access: "full", canShare: true, canDeleteAny: true });
    const response = await getVaultAccess();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data).toEqual({ level: "full", canShare: true, canDeleteAny: true });
  });
});

describe("App Review sample account", () => {
  it("stays blocked from the managers and vault APIs", async () => {
    const { isAppReviewPathAllowed } = await import("@/src/lib/app-review");
    expect(isAppReviewPathAllowed("/api/managers")).toBe(false);
    expect(isAppReviewPathAllowed("/api/vault/access")).toBe(false);
  });
});
