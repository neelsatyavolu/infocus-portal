import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMediaAccess: vi.fn(),
  requireProjectRole: vi.fn(),
  getProjectMediaPage: vi.fn(),
  getMediaReviewData: vi.fn(),
  mediaItemFindUnique: vi.fn(),
  mediaVersionFindFirst: vi.fn(),
  resolveThumbnailUrl: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    mediaItem: { findUnique: mocks.mediaItemFindUnique },
    mediaVersion: { findFirst: mocks.mediaVersionFindFirst }
  }
}));

vi.mock("@/src/server/memberships", () => ({
  requireMediaAccess: mocks.requireMediaAccess,
  requireProjectRole: mocks.requireProjectRole
}));

vi.mock("@/src/lib/media-playback", () => ({
  resolveThumbnailUrl: mocks.resolveThumbnailUrl,
  resolvePlaybackUrl: vi.fn()
}));

vi.mock("@/src/server/media-review", () => ({
  getMediaReviewData: mocks.getMediaReviewData
}));

vi.mock("@/src/server/project-media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/project-media")>()),
  getProjectMediaPage: mocks.getProjectMediaPage
}));

import { GET as getMedia } from "@/app/api/media/[mediaId]/route";
import { GET as getReview } from "@/app/api/media/[mediaId]/review/route";
import { GET as getPoster } from "@/app/api/media/[mediaId]/versions/[versionId]/poster/route";
import { GET as listProjectMedia } from "@/app/api/projects/[projectId]/media/route";

const REVIEW_ROLES = [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER];

function videoVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "version_1",
    versionNumber: 1,
    sourceType: "VIDEO",
    status: "READY",
    storageProvider: "NAS",
    bunnyVideoId: "nas:version_1",
    nasPath: "Package Cycles/Cycle 1/clip.mp4",
    storageSizeBytes: BigInt(5_000_000_000),
    imageBase64: "should-not-leak",
    uploadSignature: "should-not-leak",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    _count: { comments: 2 },
    ...overrides
  };
}

function mediaRow() {
  const version = videoVersion();
  const image = videoVersion({
    id: "version_2",
    versionNumber: 2,
    sourceType: "IMAGE",
    storageSizeBytes: null
  });
  return {
    id: "media_1",
    title: "Clip",
    projectId: "project_1",
    folderId: null,
    currentVersionId: "version_2",
    versions: [image, version],
    currentVersion: image
  };
}

async function json(response: Response) {
  return (await response.json()) as { data?: Record<string, unknown>; error?: { message: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveThumbnailUrl.mockResolvedValue("https://drive.test/poster.jpg");
  mocks.requireMediaAccess.mockResolvedValue({ userId: "user_1", media: { id: "media_1" } });
  mocks.requireProjectRole.mockResolvedValue({});
});

describe("GET /api/media/[mediaId]", () => {
  const params = { params: Promise.resolve({ mediaId: "media_1" }) };

  it("uses the review page's access check and returns a JSON-safe row", async () => {
    mocks.mediaItemFindUnique.mockResolvedValue(mediaRow());

    const response = await getMedia(new Request("https://infocus.test/api/media/media_1"), params);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(mocks.requireMediaAccess).toHaveBeenCalledWith("media_1", REVIEW_ROLES, { allowVisibility: true });
    const versions = body.data?.versions as Array<Record<string, unknown>>;
    expect(versions[1].storageSizeBytes).toBe(5_000_000_000);
    expect(versions[1].thumbnailUrl).toBe("https://drive.test/poster.jpg");
    expect(versions[0].storageSizeBytes).toBeNull();
    expect(versions[0].thumbnailUrl).toBe("/api/media/media_1/versions/version_2/image");
    expect(versions[1]).not.toHaveProperty("imageBase64");
    expect(versions[1]).not.toHaveProperty("uploadSignature");
    expect((body.data?.currentVersion as Record<string, unknown>).id).toBe("version_2");
  });

  it("returns 403 when the viewer has no access", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await getMedia(new Request("https://infocus.test/api/media/media_1"), params);

    expect(response.status).toBe(403);
    expect(mocks.mediaItemFindUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await getMedia(new Request("https://infocus.test/api/media/media_1"), params);

    expect(response.status).toBe(401);
  });
});

describe("GET /api/media/[mediaId]/review", () => {
  const params = { params: Promise.resolve({ mediaId: "media_1" }) };

  it("returns the page's review data and permission flags", async () => {
    mocks.getMediaReviewData.mockResolvedValue({
      data: { mediaId: "media_1", projectId: "project_1", versions: [], comments: [], currentVersionId: "" },
      allowComment: false,
      isInitialCut: true,
      canViewShareLinks: true
    });

    const response = await getReview(new Request("https://infocus.test/api/media/media_1/review"), params);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(mocks.getMediaReviewData).toHaveBeenCalledWith({ mediaId: "media_1", version: null });
    expect(body.data).toMatchObject({
      mediaId: "media_1",
      projectId: "project_1",
      allowComment: false,
      isInitialCut: true,
      canViewShareLinks: true
    });
  });

  it("picks a version by number or by id", async () => {
    mocks.getMediaReviewData.mockResolvedValue({ data: {}, allowComment: true, isInitialCut: false, canViewShareLinks: false });

    await getReview(new Request("https://infocus.test/api/media/media_1/review?version=3"), params);
    await getReview(new Request("https://infocus.test/api/media/media_1/review?version=ckversion"), params);

    expect(mocks.getMediaReviewData).toHaveBeenNthCalledWith(1, { mediaId: "media_1", version: { number: 3 } });
    expect(mocks.getMediaReviewData).toHaveBeenNthCalledWith(2, { mediaId: "media_1", version: { id: "ckversion" } });
  });

  it("returns 404 when the viewer has no access or the item is missing", async () => {
    mocks.getMediaReviewData.mockResolvedValue(null);

    const response = await getReview(new Request("https://infocus.test/api/media/media_1/review"), params);

    expect(response.status).toBe(404);
  });

  it("returns 401 when signed out", async () => {
    mocks.getMediaReviewData.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await getReview(new Request("https://infocus.test/api/media/media_1/review"), params);

    expect(response.status).toBe(401);
  });
});

describe("GET /api/media/[mediaId]/versions/[versionId]/poster", () => {
  const params = { params: Promise.resolve({ mediaId: "media_1", versionId: "version_1" }) };

  it("returns the same poster URL the web tiles use", async () => {
    mocks.mediaVersionFindFirst.mockResolvedValue(videoVersion());

    const response = await getPoster(new Request("https://infocus.test/poster"), params);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(mocks.requireMediaAccess).toHaveBeenCalledWith("media_1", REVIEW_ROLES, { allowVisibility: true });
    expect(mocks.mediaVersionFindFirst).toHaveBeenCalledWith({ where: { id: "version_1", mediaItemId: "media_1" } });
    expect(body.data).toEqual({ thumbnailUrl: "https://drive.test/poster.jpg" });
  });

  it("returns 404 for a version of another item", async () => {
    mocks.mediaVersionFindFirst.mockResolvedValue(null);

    const response = await getPoster(new Request("https://infocus.test/poster"), params);

    expect(response.status).toBe(404);
  });

  it("returns 403 when the viewer has no access", async () => {
    mocks.requireMediaAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await getPoster(new Request("https://infocus.test/poster"), params);

    expect(response.status).toBe(403);
    expect(mocks.mediaVersionFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[projectId]/media", () => {
  const params = { params: Promise.resolve({ projectId: "project_1" }) };

  it("serializes BigInt sizes instead of failing", async () => {
    mocks.getProjectMediaPage.mockResolvedValue({
      items: [mediaRow()],
      totalCount: 1,
      page: 1,
      pageSize: 40,
      totalPages: 1
    });

    const response = await listProjectMedia(new Request("https://infocus.test/api/projects/project_1/media"), params);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ totalCount: 1, page: 1, pageSize: 40, totalPages: 1 });
    const item = (body.data?.items as Array<Record<string, unknown>>)[0];
    const versions = item.versions as Array<Record<string, unknown>>;
    expect(versions[1]).toMatchObject({ storageSizeBytes: 5_000_000_000, thumbnailUrl: "https://drive.test/poster.jpg" });
    expect(versions[1]._count).toEqual({ comments: 2 });
  });

  it("returns 403 when the viewer cannot see the project", async () => {
    mocks.requireProjectRole.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await listProjectMedia(new Request("https://infocus.test/api/projects/project_1/media"), params);

    expect(response.status).toBe(403);
    expect(mocks.getProjectMediaPage).not.toHaveBeenCalled();
  });
});
