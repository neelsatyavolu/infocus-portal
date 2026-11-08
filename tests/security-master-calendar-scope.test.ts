import { ApprovalStatus, WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  requireMediaAccess: vi.fn(),
  mediaItemFindMany: vi.fn(),
  versionFindUnique: vi.fn(),
  versionUpdate: vi.fn(),
  approvalEventCreate: vi.fn(),
  approvalEventFindFirst: vi.fn(),
  calendarEntryFindFirst: vi.fn(),
  activityCreate: vi.fn(),
  auditCreate: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: mocks.getPlatformAccess
}));

vi.mock("@/src/server/memberships", () => ({
  requireMediaAccess: mocks.requireMediaAccess
}));

vi.mock("@/src/lib/prisma", () => {
  const tx = {
    mediaVersion: { findUnique: mocks.versionFindUnique, update: mocks.versionUpdate },
    approvalEvent: { create: mocks.approvalEventCreate },
    activityEvent: { create: mocks.activityCreate },
    auditLog: { create: mocks.auditCreate }
  };
  return {
    prisma: {
      ...tx,
      mediaItem: { findMany: mocks.mediaItemFindMany },
      approvalEvent: { create: mocks.approvalEventCreate, findFirst: mocks.approvalEventFindFirst },
      masterCalendarEntry: { findFirst: mocks.calendarEntryFindFirst },
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx)
    }
  };
});

import { POST as markAired } from "@/app/api/master-calendar/mark-aired/route";
import { POST as unmarkAired } from "@/app/api/master-calendar/unmark-aired/route";
import { GET as searchPackages } from "@/app/api/master-calendar/packages/route";

const MEDIA_ID = "cjld2cjxh0000qzrmn831i7rn";
const READ_ROLES = [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER];

function post(body: unknown) {
  return new Request("https://infocus.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("master calendar routes stay inside the caller's workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user_sage");
    mocks.syncUserProfile.mockResolvedValue({ id: "user_sage", email: "sage@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.requireMediaAccess.mockResolvedValue({
      userId: "user_sage",
      media: {
        id: MEDIA_ID,
        currentVersionId: "version_1",
        deletedAt: null,
        project: { id: "project_1", workspaceId: "ws_1" }
      }
    });
    mocks.versionFindUnique.mockResolvedValue({ approvalStatus: ApprovalStatus.APPROVED, airedAt: null });
    mocks.versionUpdate.mockResolvedValue({ id: "version_1", approvalStatus: ApprovalStatus.AIRED, airedAt: new Date() });
    mocks.mediaItemFindMany.mockResolvedValue([]);
  });

  it("mark-aired refuses media the producer cannot reach", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await markAired(post({ mediaItemId: MEDIA_ID, date: "2026-11-09" }));

    expect(response.status).toBe(403);
    expect(mocks.requireMediaAccess).toHaveBeenCalledWith(MEDIA_ID, READ_ROLES, { allowVisibility: true });
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
  });

  it("mark-aired refuses a version that is not approved", async () => {
    mocks.versionFindUnique.mockResolvedValue({ approvalStatus: ApprovalStatus.IN_REVIEW, airedAt: null });

    const response = await markAired(post({ mediaItemId: MEDIA_ID, date: "2026-11-09" }));

    expect(response.status).toBe(400);
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
  });

  it("mark-aired marks an approved version in a reachable workspace", async () => {
    const response = await markAired(post({ mediaItemId: MEDIA_ID, date: "2026-11-09" }));

    expect(response.status).toBe(200);
    expect(mocks.versionUpdate).toHaveBeenCalledTimes(1);
  });

  it("unmark-aired refuses media the producer cannot reach", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await unmarkAired(post({ mediaItemId: MEDIA_ID }));

    expect(response.status).toBe(403);
    expect(mocks.requireMediaAccess).toHaveBeenCalledWith(MEDIA_ID, READ_ROLES, { allowVisibility: true });
    expect(mocks.versionUpdate).not.toHaveBeenCalled();
  });

  it("packages search filters by the caller's workspace access", async () => {
    const response = await searchPackages(new Request("https://infocus.test/api/master-calendar/packages?q=Abby"));

    expect(response.status).toBe(200);
    const where = mocks.mediaItemFindMany.mock.calls[0][0].where;
    expect(where.project.workspace.OR).toEqual(
      expect.arrayContaining([{ members: { some: { userId: "user_sage" } } }])
    );
    // An associate producer must not get ADMINS_ONLY workspaces they are not a member of.
    expect(JSON.stringify(where.project.workspace)).not.toContain("ADMINS_ONLY");
  });
});
