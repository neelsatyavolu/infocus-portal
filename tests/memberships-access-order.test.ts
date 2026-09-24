import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
  db: {
    project: { findUnique: vi.fn() },
    mediaItem: { findUnique: vi.fn() }
  }
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformRoleForEmail: vi.fn(),
  hasPlatformRole: vi.fn()
}));
vi.mock("@/src/server/workspace-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess
}));

import { requireMediaAccess, requireProjectRole } from "@/src/server/memberships";

const membership = { role: "EDITOR" };

describe("access helpers keep error precedence while loading in parallel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user_1");
    mocks.syncUserProfile.mockResolvedValue({ id: "user_1", email: "abby@example.edu" });
    mocks.resolveWorkspaceAccess.mockResolvedValue({ membership, isDirectMember: true });
  });

  it("requireProjectRole reports FORBIDDEN from the profile before NOT_FOUND", async () => {
    mocks.syncUserProfile.mockRejectedValue(new Error("FORBIDDEN"));
    mocks.db.project.findUnique.mockResolvedValue(null);

    await expect(requireProjectRole("missing")).rejects.toThrow("FORBIDDEN");
  });

  it("requireProjectRole reports NOT_FOUND for a missing project", async () => {
    mocks.db.project.findUnique.mockResolvedValue(null);

    await expect(requireProjectRole("missing")).rejects.toThrow("NOT_FOUND");
  });

  it("requireProjectRole returns the project and membership", async () => {
    mocks.db.project.findUnique.mockResolvedValue({ id: "p1", name: "Package", workspaceId: "w1" });

    await expect(requireProjectRole("p1")).resolves.toMatchObject({
      userId: "user_1",
      project: { id: "p1" },
      membership
    });
    expect(mocks.resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", userId: "user_1", email: "abby@example.edu" })
    );
  });

  it("requireMediaAccess still reports NOT_FOUND before auth for a missing item", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    mocks.db.mediaItem.findUnique.mockResolvedValue(null);

    await expect(requireMediaAccess("missing")).rejects.toThrow("NOT_FOUND");
  });

  it("requireMediaAccess reports UNAUTHORIZED for an existing item", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    mocks.db.mediaItem.findUnique.mockResolvedValue({
      id: "m1",
      project: { id: "p1", name: "Package", workspaceId: "w1" },
      folder: null
    });

    await expect(requireMediaAccess("m1")).rejects.toThrow("UNAUTHORIZED");
  });

  it("requireMediaAccess returns access for a signed-in member", async () => {
    mocks.db.mediaItem.findUnique.mockResolvedValue({
      id: "m1",
      project: { id: "p1", name: "Package", workspaceId: "w1" },
      folder: null
    });

    await expect(requireMediaAccess("m1")).resolves.toMatchObject({ userId: "user_1", membership });
  });
});
