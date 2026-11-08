import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMediaAccess: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  rowFindMany: vi.fn(),
  versionFindFirst: vi.fn(),
  versionFindUnique: vi.fn(),
  versionCreate: vi.fn(),
  versionUpdate: vi.fn(),
  mediaItemUpdate: vi.fn(),
  activityCreate: vi.fn(),
  auditCreate: vi.fn(),
  nasMintUploadSession: vi.fn()
}));

vi.mock("@/src/server/memberships", () => ({
  requireMediaAccess: mocks.requireMediaAccess
}));

vi.mock("@/src/lib/auth", () => ({
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: mocks.getPlatformAccess
}));

vi.mock("@/src/lib/bunny", () => ({
  createBunnyVideo: vi.fn(),
  createUploadAuthorization: vi.fn()
}));

vi.mock("@/src/lib/nas-storage", () => ({
  buildNasMediaPath: () => "Package Storage/Cycle 1/Abby/Final Cut/cut.mp4",
  isNasStorageEnabled: () => true,
  nasMintUploadSession: mocks.nasMintUploadSession
}));

vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: () => "key",
  limitByKey: () => ({ allowed: true })
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findMany: mocks.rowFindMany },
    mediaVersion: {
      findFirst: mocks.versionFindFirst,
      findUnique: mocks.versionFindUnique,
      create: mocks.versionCreate,
      update: mocks.versionUpdate
    },
    mediaItem: { update: mocks.mediaItemUpdate },
    activityEvent: { create: mocks.activityCreate },
    auditLog: { create: mocks.auditCreate }
  }
}));

import { POST as initVersionUpload } from "@/app/api/media/[mediaId]/versions/init-upload/route";
import { POST as completeNasUpload } from "@/app/api/media/[mediaId]/versions/[versionId]/complete-nas-upload/route";
import { PATCH as uploadComplete } from "@/app/api/media/[mediaId]/versions/[versionId]/upload-complete/route";

const versionParams = { params: Promise.resolve({ mediaId: "media_cut", versionId: "version_2" }) };

const routes = [
  [
    "init-upload",
    () =>
      initVersionUpload(
        new Request("https://infocus.test/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Otto's new cut", fileName: "cut.mp4" })
        }),
        { params: Promise.resolve({ mediaId: "media_cut" }) }
      )
  ],
  ["complete-nas-upload", () => completeNasUpload(new Request("https://infocus.test/api", { method: "POST" }), versionParams)],
  ["upload-complete", () => uploadComplete(new Request("https://infocus.test/api", { method: "PATCH" }), versionParams)]
] as const;

describe("generic version routes on package-cycle cuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMediaAccess.mockResolvedValue({
      userId: "user_otto",
      membership: { role: WorkspaceRole.REVIEWER },
      isDirectMember: false,
      media: {
        id: "media_cut",
        title: "Otto's cut",
        project: { id: "project_1", name: "Cycle 1", workspaceId: "ws_1" },
        folder: null
      }
    });
    mocks.syncUserProfile.mockResolvedValue({ id: "user_otto", email: "otto@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.rowFindMany.mockResolvedValue([{ assignedProducerUserId: "user_abby", members: [{ userId: "user_otto" }] }]);
    mocks.nasMintUploadSession.mockResolvedValue({
      videoId: "nas:1",
      path: "Package Storage/Cycle 1/Abby/Final Cut/cut.mp4",
      uploadUrl: "https://drive.example.edu/upload",
      token: "t",
      expiresAt: 1,
      signature: "s"
    });
    mocks.versionFindFirst.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id ? { id: "version_2", storageProvider: "NAS", nasPath: "x" } : { versionNumber: 1 })
    );
    mocks.versionFindUnique.mockResolvedValue({ id: "version_2", mediaItemId: "media_cut", status: "UPLOADING" });
    mocks.versionCreate.mockResolvedValue({ id: "version_2" });
    mocks.versionUpdate.mockResolvedValue({ id: "version_2", status: "READY" });
  });

  it.each(routes)("%s refuses a student on an Initial or Final Cut", async (_name, call) => {
    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.rowFindMany).toHaveBeenCalledWith({
      where: { OR: [{ initialCutMediaItemId: "media_cut" }, { finalCutMediaItemId: "media_cut" }] },
      select: { assignedProducerUserId: true, members: { select: { userId: true } } }
    });
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
    expect(mocks.mediaItemUpdate).not.toHaveBeenCalled();
  });

  it.each(routes)("%s refuses an associate producer on the package roster", async (_name, call) => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });

    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.versionCreate).not.toHaveBeenCalled();
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
  });

  it.each(routes)("%s allows the assigned associate producer", async (_name, call) => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.rowFindMany.mockResolvedValue([{ assignedProducerUserId: "user_otto", members: [{ userId: "user_sage" }] }]);

    const response = await call();

    expect(response.status).toBeLessThan(300);
  });

  it.each(routes)("%s allows an executive producer", async (_name, call) => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "EXECUTIVE_PRODUCER" });

    const response = await call();

    expect(response.status).toBeLessThan(300);
  });

  it.each(routes)("%s still allows a student on media that is not a cycle cut", async (_name, call) => {
    mocks.rowFindMany.mockResolvedValue([]);

    const response = await call();

    expect(response.status).toBeLessThan(300);
    expect(mocks.getPlatformAccess).not.toHaveBeenCalled();
  });
});
