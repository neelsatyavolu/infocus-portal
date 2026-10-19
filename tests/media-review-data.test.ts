import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMediaAccess: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  mediaItemFindFirst: vi.fn(),
  packageRowFindFirst: vi.fn(),
  resolvePlaybackUrl: vi.fn(),
  resolveThumbnailUrl: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    mediaItem: { findFirst: mocks.mediaItemFindFirst },
    packageProgressRow: { findFirst: mocks.packageRowFindFirst }
  }
}));
vi.mock("@/src/server/memberships", () => ({ requireMediaAccess: mocks.requireMediaAccess }));
vi.mock("@/src/lib/auth", () => ({ syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.getPlatformAccess,
  hasPlatformRole: () => false
}));
vi.mock("@/src/lib/media-playback", () => ({
  resolvePlaybackUrl: mocks.resolvePlaybackUrl,
  resolveThumbnailUrl: mocks.resolveThumbnailUrl
}));
vi.mock("@/src/server/comment-access", () => ({ initialCutReviewClosed: vi.fn() }));
vi.mock("@/src/server/package-approval-service", () => ({ loadApprovalView: vi.fn() }));

import { getMediaReviewData } from "@/src/server/media-review";

function version(id: string, versionNumber: number) {
  return {
    id,
    versionNumber,
    bunnyVideoId: `nas:${id}`,
    sourceType: "VIDEO",
    status: "READY",
    approvalStatus: "IN_REVIEW",
    airedAt: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    comments: [
      {
        id: `comment_${id}`,
        mediaVersionId: id,
        body: "Trim the intro",
        authorId: "user_2",
        author: { id: "user_2", name: "Sage", nickname: null, email: "sage@example.edu" },
        timeSeconds: 12.5,
        frameNumber: 375,
        xPct: null,
        yPct: null,
        targetType: "VIDEO",
        createdAt: new Date("2026-10-02T00:00:00Z"),
        resolvedAt: null,
        parentCommentId: null
      }
    ]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMediaAccess.mockResolvedValue({
    userId: "user_1",
    isDirectMember: true,
    membership: { role: WorkspaceRole.REVIEWER }
  });
  mocks.syncUserProfile.mockResolvedValue({ email: "abby@example.edu" });
  mocks.getPlatformAccess.mockResolvedValue({ role: null, canManageWorkspaces: false });
  mocks.packageRowFindFirst.mockResolvedValue(null);
  mocks.resolvePlaybackUrl.mockResolvedValue("https://drive.test/play.mp4");
  mocks.resolveThumbnailUrl.mockResolvedValue(null);
  const v1 = version("version_1", 1);
  const v2 = version("version_2", 2);
  mocks.mediaItemFindFirst.mockResolvedValue({
    id: "media_1",
    projectId: "project_1",
    title: "Clip",
    project: { name: "Cycle 1" },
    folder: null,
    memberAssignments: [],
    versions: [v2, v1],
    currentVersion: v2
  });
});

describe("getMediaReviewData", () => {
  it("returns null when the viewer has no access", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(getMediaReviewData({ mediaId: "media_1" })).resolves.toBeNull();
    expect(mocks.mediaItemFindFirst).not.toHaveBeenCalled();
  });

  it("rethrows sign-in errors", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("UNAUTHORIZED"));

    await expect(getMediaReviewData({ mediaId: "media_1" })).rejects.toThrow("UNAUTHORIZED");
  });

  it("checks the same roles as the review page", async () => {
    await getMediaReviewData({ mediaId: "media_1", projectId: "project_1" });

    expect(mocks.requireMediaAccess).toHaveBeenCalledWith(
      "media_1",
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      { allowVisibility: true }
    );
    expect(mocks.mediaItemFindFirst.mock.calls[0][0].where).toEqual({ id: "media_1", projectId: "project_1" });
  });

  it("looks the item up by id alone when no project is given", async () => {
    const review = await getMediaReviewData({ mediaId: "media_1" });

    expect(mocks.mediaItemFindFirst.mock.calls[0][0].where).toEqual({ id: "media_1" });
    expect(review?.data.projectId).toBe("project_1");
    expect(review?.data.currentVersionId).toBe("version_2");
    expect(review?.allowComment).toBe(true);
    expect(review?.data.comments).toHaveLength(2);
    expect(review?.data.comments[0]).toMatchObject({ authorName: "Sage", timeSeconds: 12.5, frameNumber: 375 });
  });

  it("selects a version by number or id", async () => {
    const byNumber = await getMediaReviewData({ mediaId: "media_1", version: { number: 1 } });
    const byId = await getMediaReviewData({ mediaId: "media_1", version: { id: "version_1" } });
    const unknown = await getMediaReviewData({ mediaId: "media_1", version: { number: 9 } });

    expect(byNumber?.data.currentVersionId).toBe("version_1");
    expect(byId?.data.currentVersionId).toBe("version_1");
    expect(unknown?.data.currentVersionId).toBe("version_2");
  });
});
