import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    mediaVersion: { update: vi.fn() },
    mediaItem: { update: vi.fn() },
    packageProgressRow: { update: vi.fn(), aggregate: vi.fn(), create: vi.fn() }
  };
  return {
    tx,
    prisma: {
      mediaVersion: { findFirst: vi.fn(), update: vi.fn() },
      mediaItem: { update: vi.fn() },
      packageProgressRow: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))
    },
    setQueuedForAir: vi.fn()
  };
});

vi.mock("@/src/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/src/server/publishing-queue", () => ({ setQueuedForAir: mocks.setQueuedForAir }));
vi.mock("@/src/server/cycle-project-folders", () => ({ ensureProjectFolderPath: vi.fn() }));
vi.mock("@/src/lib/nas-storage", () => ({
  buildPublishingQueueNasPath: vi.fn(),
  isNasStorageEnabled: vi.fn(() => true),
  nasMintUploadSession: vi.fn()
}));

import { CUSTOM_QUEUE_PROJECT_NAME } from "@/src/lib/publishing-queue";
import { completeCustomQueueUpload } from "@/src/server/publishing-queue-custom";

function version(overrides: { status?: string; projectName?: string; deletedAt?: Date | null } = {}) {
  return {
    id: "version_1",
    status: overrides.status ?? "UPLOADING",
    createdById: "user_abby",
    mediaItem: {
      projectId: "project_queue",
      createdById: "user_abby",
      deletedAt: overrides.deletedAt ?? null,
      project: { name: overrides.projectName ?? CUSTOM_QUEUE_PROJECT_NAME }
    }
  };
}

const input = { userId: "user_abby", title: "Friday opener", mediaId: "media_1", versionId: "version_1" };

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  expect(mocks.tx.mediaVersion.update).not.toHaveBeenCalled();
  expect(mocks.tx.mediaItem.update).not.toHaveBeenCalled();
  expect(mocks.prisma.mediaVersion.update).not.toHaveBeenCalled();
  expect(mocks.prisma.mediaItem.update).not.toHaveBeenCalled();
  expect(mocks.setQueuedForAir).not.toHaveBeenCalled();
}

describe("completeCustomQueueUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.mediaVersion.findFirst.mockResolvedValue(version());
    mocks.prisma.packageProgressRow.findFirst.mockResolvedValue(null);
    mocks.tx.packageProgressRow.aggregate.mockResolvedValue({ _max: { rowOrder: 4 } });
    mocks.tx.packageProgressRow.create.mockResolvedValue({ id: "row_new" });
    mocks.setQueuedForAir.mockResolvedValue({ id: "row_new" });
  });

  it("refuses an existing non-custom package before writing anything", async () => {
    mocks.prisma.packageProgressRow.findFirst.mockResolvedValue({ id: "row_1", cycleNumber: 2, groupType: "News" });
    await expect(completeCustomQueueUpload(input)).rejects.toThrow("CONFLICT");
    expectNoWrites();
  });

  it("refuses media outside the custom queue project", async () => {
    mocks.prisma.mediaVersion.findFirst.mockResolvedValue(version({ projectName: "Cycle 2 package" }));
    await expect(completeCustomQueueUpload(input)).rejects.toThrow("FORBIDDEN");
    expectNoWrites();
  });

  it("refuses a failed upload", async () => {
    mocks.prisma.mediaVersion.findFirst.mockResolvedValue(version({ status: "FAILED" }));
    await expect(completeCustomQueueUpload(input)).rejects.toThrow("CONFLICT");
    expectNoWrites();
  });

  it("refuses someone else's upload and deleted media", async () => {
    await expect(completeCustomQueueUpload({ ...input, userId: "user_otto" })).rejects.toThrow("FORBIDDEN");
    mocks.prisma.mediaVersion.findFirst.mockResolvedValue(version({ deletedAt: new Date() }));
    await expect(completeCustomQueueUpload(input)).rejects.toThrow("NOT_FOUND");
    expectNoWrites();
  });

  it("writes everything in one transaction, then queues the new row", async () => {
    await completeCustomQueueUpload(input);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.mediaVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "version_1" }, data: expect.objectContaining({ status: "READY" }) })
    );
    expect(mocks.tx.mediaItem.update).toHaveBeenCalledWith({
      where: { id: "media_1" },
      data: { currentVersionId: "version_1", title: "Friday opener" }
    });
    expect(mocks.tx.packageProgressRow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rowOrder: 5, groupTopic: "Friday opener", finalCutMediaItemId: "media_1" })
    });
    expect(mocks.setQueuedForAir).toHaveBeenCalledWith("row_new", true);
  });

  it("renames an existing custom row inside the transaction", async () => {
    mocks.prisma.packageProgressRow.findFirst.mockResolvedValue({
      id: "row_1",
      cycleNumber: 0,
      groupType: "CUSTOM_QUEUE",
      groupTopic: "Old title"
    });
    await completeCustomQueueUpload(input);

    expect(mocks.tx.packageProgressRow.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: { groupTopic: "Friday opener" }
    });
    expect(mocks.tx.packageProgressRow.create).not.toHaveBeenCalled();
    expect(mocks.setQueuedForAir).toHaveBeenCalledWith("row_1", true);
  });
});
