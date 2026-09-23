import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOriginalVideoDownloadToken: vi.fn(),
  findUnique: vi.fn(),
  requireMediaAccess: vi.fn()
}));

vi.mock("@/src/lib/bunny", () => ({
  createOriginalVideoDownloadToken: mocks.createOriginalVideoDownloadToken
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    mediaVersion: {
      findUnique: mocks.findUnique
    }
  }
}));

vi.mock("@/src/server/memberships", () => ({
  requireMediaAccess: mocks.requireMediaAccess
}));

import { GET } from "@/app/api/media/[mediaId]/download/route";

describe("media download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("proxied video bytes")))
    );

    mocks.requireMediaAccess.mockResolvedValue({
      media: {
        id: "media_1",
        currentVersionId: "version_current",
        title: "Demo Video"
      }
    });
    mocks.findUnique.mockResolvedValue({
      id: "version_2",
      mediaItemId: "media_1",
      sourceType: "VIDEO",
      bunnyVideoId: "bunny_video_1"
    });
    mocks.createOriginalVideoDownloadToken.mockReturnValue({
      token: "stub-token",
      expiresAt: 123,
      downloadUrl: "https://pull-zone.b-cdn.net/bunny_video_1/original?token=stub-token&expires=123"
    });
  });

  it("redirects single-video downloads directly to Bunny instead of proxying bytes", async () => {
    const response = await GET(
      new Request("https://infocus.test/api/media/media_1/download?mediaVersionId=version_2"),
      { params: Promise.resolve({ mediaId: "media_1" }) }
    );

    expect(mocks.requireMediaAccess).toHaveBeenCalledWith(
      "media_1",
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      { allowVisibility: true }
    );
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "version_2" } });
    expect(mocks.createOriginalVideoDownloadToken).toHaveBeenCalledWith("bunny_video_1", 60 * 30);
    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://pull-zone.b-cdn.net/bunny_video_1/original?token=stub-token&expires=123"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
