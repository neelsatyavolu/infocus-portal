import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nasMintDownloadUrl: vi.fn(),
  isNasVideoId: vi.fn((id: string | null | undefined) => Boolean(id?.startsWith("nas_"))),
  createPlaybackToken: vi.fn(),
  thumbnailFromPlaybackUrl: vi.fn()
}));

vi.mock("@/src/lib/nas-storage", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/nas-storage")>("@/src/lib/nas-storage");
  return {
    ...actual,
    nasMintDownloadUrl: mocks.nasMintDownloadUrl,
    isNasVideoId: mocks.isNasVideoId
  };
});

vi.mock("@/src/lib/bunny", () => ({
  createPlaybackToken: mocks.createPlaybackToken
}));

vi.mock("@/src/lib/bunny-utils", () => ({
  thumbnailFromPlaybackUrl: mocks.thumbnailFromPlaybackUrl
}));

import {
  resolveOriginalDownloadUrl,
  resolvePlaybackUrl,
  resolveThumbnailUrl
} from "@/src/lib/media-playback";

const FILE_URL =
  "https://drive.infocuspaly.com/api/service/file?path=Package%20Storage%2FCycle%201%2FJeffDay.mov&token=tok";

const nasVersion = {
  bunnyVideoId: "nas_abc",
  storageProvider: "NAS",
  nasPath: "Package Storage/Cycle 1/JeffDay.mov",
  status: "READY"
};

describe("NAS media playback URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nasMintDownloadUrl.mockResolvedValue(FILE_URL);
  });

  it("plays NAS videos through Drive web=1 instead of the raw ProRes/XAVC file", async () => {
    const url = new URL((await resolvePlaybackUrl(nasVersion)) ?? "");
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledWith(nasVersion.nasPath, 60 * 30);
    expect(url.searchParams.get("web")).toBe("1");
  });

  it("uses Drive ffmpeg thumbnails, not a missing poster.jpg", async () => {
    const url = new URL((await resolveThumbnailUrl(nasVersion)) ?? "");
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledWith(nasVersion.nasPath, 60 * 60 * 6);
    expect(url.pathname).toBe("/api/service/thumbnail");
    expect(url.searchParams.get("size")).toBe("512");
    expect(url.toString()).not.toContain("poster.jpg");
  });

  it("keeps original downloads on the raw file (no web transcode)", async () => {
    const url = await resolveOriginalDownloadUrl(nasVersion);
    expect(url).toBe(FILE_URL);
    expect(url).not.toContain("web=1");
  });
});
