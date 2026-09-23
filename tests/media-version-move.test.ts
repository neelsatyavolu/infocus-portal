import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  mediaItemFindUnique: vi.fn(),
  mediaItemUpdate: vi.fn(),
  mediaVersionUpdate: vi.fn(),
  mediaItemAssignmentCreateMany: vi.fn(),
  activityEventCreate: vi.fn(),
  auditLogCreate: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

import { moveMediaIntoVersion } from "@/src/server/media-version-move";

function mediaItem(overrides: Partial<{
  id: string;
  title: string;
  projectId: string;
  deletedAt: Date | null;
  currentVersionId: string | null;
  versions: Array<{ id: string; versionNumber: number; sourceType: string }>;
  memberAssignments: Array<{ userId: string }>;
}> = {}) {
  return {
    id: "source_media",
    title: "Duplicate package",
    projectId: "project_1",
    folderId: "folder_1",
    deletedAt: null,
    currentVersionId: "source_v2",
    project: {
      id: "project_1",
      name: "Package Cycle 1",
      workspaceId: "workspace_1"
    },
    versions: [
      { id: "source_v1", versionNumber: 1, sourceType: "VIDEO" },
      { id: "source_v2", versionNumber: 2, sourceType: "VIDEO" }
    ],
    memberAssignments: [{ userId: "user_a" }],
    ...overrides
  };
}

describe("moveMediaIntoVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        mediaItem: {
          findUnique: mocks.mediaItemFindUnique,
          update: mocks.mediaItemUpdate
        },
        mediaVersion: {
          update: mocks.mediaVersionUpdate
        },
        mediaItemAssignment: {
          createMany: mocks.mediaItemAssignmentCreateMany
        },
        activityEvent: {
          create: mocks.activityEventCreate
        },
        auditLog: {
          create: mocks.auditLogCreate
        }
      })
    );
    mocks.mediaItemUpdate.mockResolvedValue({});
    mocks.mediaVersionUpdate.mockResolvedValue({});
    mocks.mediaItemAssignmentCreateMany.mockResolvedValue({ count: 1 });
    mocks.activityEventCreate.mockResolvedValue({});
    mocks.auditLogCreate.mockResolvedValue({});
  });

  it("moves duplicate media versions onto the target and merges assigned people", async () => {
    const source = mediaItem();
    const target = mediaItem({
      id: "target_media",
      title: "Correct package",
      currentVersionId: "target_v3",
      versions: [
        { id: "target_v2", versionNumber: 2, sourceType: "VIDEO" },
        { id: "target_v3", versionNumber: 3, sourceType: "VIDEO" }
      ],
      memberAssignments: [{ userId: "user_b" }]
    });

    mocks.mediaItemFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "source_media" ? source : target)
    );

    const result = await moveMediaIntoVersion({
      sourceMediaId: "source_media",
      targetMediaId: "target_media",
      actorId: "actor_1"
    });

    expect(mocks.mediaItemUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "source_media" },
      data: { currentVersionId: null }
    });
    expect(mocks.mediaVersionUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "source_v1" },
      data: { mediaItemId: "target_media", versionNumber: 4 }
    });
    expect(mocks.mediaVersionUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "source_v2" },
      data: { mediaItemId: "target_media", versionNumber: 5 }
    });
    expect(mocks.mediaItemAssignmentCreateMany).toHaveBeenCalledWith({
      data: [{ mediaItemId: "target_media", userId: "user_a" }],
      skipDuplicates: true
    });
    expect(mocks.mediaItemUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "target_media" },
      data: expect.objectContaining({ currentVersionId: "source_v2" })
    });
    expect(mocks.mediaItemUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: "source_media" },
      data: expect.objectContaining({ deletedById: "actor_1" })
    });
    expect(mocks.activityEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "media.versions.moved",
        mediaItemId: "target_media",
        payload: expect.objectContaining({
          movedVersionIds: ["source_v1", "source_v2"]
        })
      })
    });
    expect(result).toEqual({
      sourceMediaId: "source_media",
      targetMediaId: "target_media",
      movedVersionIds: ["source_v1", "source_v2"],
      currentVersionId: "source_v2",
      assignedMemberIds: ["user_b", "user_a"],
      projectName: "Package Cycle 1"
    });
  });

  it("rejects moving media into a target with a different source type", async () => {
    const source = mediaItem();
    const target = mediaItem({
      id: "target_media",
      versions: [{ id: "target_v1", versionNumber: 1, sourceType: "IMAGE" }]
    });

    mocks.mediaItemFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "source_media" ? source : target)
    );

    await expect(
      moveMediaIntoVersion({
        sourceMediaId: "source_media",
        targetMediaId: "target_media",
        actorId: "actor_1"
      })
    ).rejects.toThrow("BAD_REQUEST");

    expect(mocks.mediaVersionUpdate).not.toHaveBeenCalled();
    expect(mocks.mediaItemAssignmentCreateMany).not.toHaveBeenCalled();
  });
});
