import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMediaAccess: vi.fn(),
  requireProjectRole: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  mediaItemUpdate: vi.fn(),
  mediaItemCount: vi.fn(),
  folderFindFirst: vi.fn(),
  folderCreate: vi.fn(),
  folderUpdate: vi.fn(),
  folderDelete: vi.fn(),
  activityCreate: vi.fn(),
  auditCreate: vi.fn(),
  recomputeForMediaItem: vi.fn()
}));

vi.mock("@/src/server/memberships", () => ({
  requireMediaAccess: mocks.requireMediaAccess,
  requireProjectRole: mocks.requireProjectRole
}));

vi.mock("@/src/lib/auth", () => ({
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.getPlatformAccess
}));

vi.mock("@/src/server/cycle-cut-status", () => ({
  recomputeForMediaItem: mocks.recomputeForMediaItem
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    mediaItem: { update: mocks.mediaItemUpdate, count: mocks.mediaItemCount },
    projectFolder: {
      findFirst: mocks.folderFindFirst,
      create: mocks.folderCreate,
      update: mocks.folderUpdate,
      delete: mocks.folderDelete
    },
    activityEvent: { create: mocks.activityCreate },
    auditLog: { create: mocks.auditCreate }
  }
}));

import { POST as restoreMedia } from "@/app/api/media/[mediaId]/restore/route";
import { PATCH as moveMediaFolder } from "@/app/api/media/[mediaId]/folder/route";
import { POST as createFolder } from "@/app/api/projects/[projectId]/folders/route";
import {
  DELETE as deleteFolder,
  PATCH as renameFolder
} from "@/app/api/projects/[projectId]/folders/[folderId]/route";

const FOLDER_ID = "cjld2cjxh0000qzrmn831i7rn";
const mediaParams = { params: Promise.resolve({ mediaId: "media_1" }) };
const projectParams = { params: Promise.resolve({ projectId: "project_1" }) };
const folderParams = { params: Promise.resolve({ projectId: "project_1", folderId: FOLDER_ID }) };

function jsonRequest(body: unknown) {
  return new Request("https://infocus.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function asRole(role: WorkspaceRole, platformRole: string | null = null) {
  const membership = { role };
  mocks.requireMediaAccess.mockResolvedValue({
    userId: "user_abby",
    membership,
    media: { id: "media_1", title: "Abby's package", projectId: "project_1", project: { id: "project_1", workspaceId: "ws_1" } }
  });
  mocks.requireProjectRole.mockResolvedValue({
    userId: "user_abby",
    membership,
    project: { id: "project_1", name: "Cycle 1", workspaceId: "ws_1" }
  });
  mocks.getPlatformAccess.mockResolvedValue({ role: platformRole });
}

const routes = [
  ["restore", () => restoreMedia(new Request("https://infocus.test/api", { method: "POST" }), mediaParams)],
  ["media folder move", () => moveMediaFolder(jsonRequest({ folderId: null }), mediaParams)],
  ["folder create", () => createFolder(jsonRequest({ name: "B-roll" }), projectParams)],
  ["folder rename", () => renameFolder(jsonRequest({ name: "B-roll" }), folderParams)],
  ["folder delete", () => deleteFolder(new Request("https://infocus.test/api", { method: "DELETE" }), folderParams)]
] as const;

describe("media and folder writes need manage access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncUserProfile.mockResolvedValue({ id: "user_abby", email: "abby@example.edu" });
    mocks.mediaItemUpdate.mockResolvedValue({ id: "media_1" });
    mocks.mediaItemCount.mockResolvedValue(0);
    mocks.folderFindFirst.mockResolvedValue({ id: FOLDER_ID, name: "B-roll" });
    mocks.folderCreate.mockResolvedValue({ id: FOLDER_ID, name: "B-roll" });
    mocks.folderUpdate.mockResolvedValue({ id: FOLDER_ID, name: "B-roll" });
    mocks.folderDelete.mockResolvedValue({ id: FOLDER_ID });
  });

  it.each(routes)("%s refuses a workspace reviewer", async (_name, call) => {
    asRole(WorkspaceRole.REVIEWER);

    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.mediaItemUpdate).not.toHaveBeenCalled();
    expect(mocks.folderCreate).not.toHaveBeenCalled();
    expect(mocks.folderUpdate).not.toHaveBeenCalled();
    expect(mocks.folderDelete).not.toHaveBeenCalled();
  });

  it.each(routes)("%s allows a workspace editor", async (_name, call) => {
    asRole(WorkspaceRole.EDITOR);

    const response = await call();

    expect(response.status).toBeLessThan(300);
  });

  it.each(routes)("%s allows a reviewer who is an associate producer", async (_name, call) => {
    asRole(WorkspaceRole.REVIEWER, "ASSOCIATE_PRODUCER");

    const response = await call();

    expect(response.status).toBeLessThan(300);
  });
});
