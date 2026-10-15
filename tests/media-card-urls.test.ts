import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nasMintDownloadUrl: vi.fn(),
  isNasVideoId: vi.fn((id: string | null | undefined) => Boolean(id?.startsWith("nas_"))),
  createPlaybackToken: vi.fn(),
  thumbnailFromPlaybackUrl: vi.fn()
}));

vi.mock("@/src/lib/nas-storage", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/nas-storage")>("@/src/lib/nas-storage");
  return { ...actual, nasMintDownloadUrl: mocks.nasMintDownloadUrl, isNasVideoId: mocks.isNasVideoId };
});
vi.mock("@/src/lib/bunny", () => ({ createPlaybackToken: mocks.createPlaybackToken }));
vi.mock("@/src/lib/bunny-utils", () => ({ thumbnailFromPlaybackUrl: mocks.thumbnailFromPlaybackUrl }));

import { resolveCardMediaUrls } from "@/src/lib/media-card-urls";
import { resolvePlaybackUrl, resolveThumbnailUrl } from "@/src/lib/media-playback";

const FILE_URL = "https://drive.example.edu/api/service/file?path=Cycle%201%2Fclip.mov&token=tok";

const nasVersion = {
  bunnyVideoId: "nas_abc",
  storageProvider: "NAS",
  nasPath: "Cycle 1/clip.mov",
  status: "READY"
};

describe("resolveCardMediaUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("mints once for a ready NAS video and derives the same URLs as the two resolvers", async () => {
    mocks.nasMintDownloadUrl.mockResolvedValue(FILE_URL);

    const urls = await resolveCardMediaUrls(nasVersion);

    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledTimes(1);
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledWith("Cycle 1/clip.mov", 60 * 60 * 6);
    mocks.nasMintDownloadUrl.mockClear();
    expect(urls).toEqual({
      thumbnailUrl: await resolveThumbnailUrl(nasVersion),
      playbackUrl: await resolvePlaybackUrl(nasVersion)
    });
    expect(urls.playbackUrl).toContain("web=1");
    expect(urls.thumbnailUrl).toContain("/thumbnail");
  });

  it("skips the poster and mints only the player link while the video is not ready", async () => {
    mocks.nasMintDownloadUrl.mockResolvedValue(FILE_URL);

    const urls = await resolveCardMediaUrls({ ...nasVersion, status: "PROCESSING" });

    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledTimes(1);
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledWith("Cycle 1/clip.mov", 60 * 30);
    expect(urls.thumbnailUrl).toBeNull();
    expect(urls.playbackUrl).toContain("web=1");
  });

  it("gives no URLs and mints nothing for a NAS version without a path", async () => {
    const urls = await resolveCardMediaUrls({ ...nasVersion, nasPath: null });

    expect(urls).toEqual({ thumbnailUrl: null, playbackUrl: null });
    expect(mocks.nasMintDownloadUrl).not.toHaveBeenCalled();
  });

  it("on a failed mint drops the poster and lets the player mint on its own", async () => {
    mocks.nasMintDownloadUrl.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(FILE_URL);

    const urls = await resolveCardMediaUrls(nasVersion);

    expect(urls.thumbnailUrl).toBeNull();
    expect(urls.playbackUrl).toContain("web=1");
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("still fails when the player link cannot be minted either", async () => {
    mocks.nasMintDownloadUrl.mockRejectedValue(new Error("offline"));

    await expect(resolveCardMediaUrls(nasVersion)).rejects.toThrow("offline");
  });

  it("uses the Bunny resolvers for Bunny videos (no Drive mint)", async () => {
    mocks.createPlaybackToken.mockReturnValue({ playbackUrl: "https://cdn.example.edu/vid/playlist.m3u8" });
    mocks.thumbnailFromPlaybackUrl.mockReturnValue("https://cdn.example.edu/vid/thumbnail.jpg");

    const urls = await resolveCardMediaUrls({ bunnyVideoId: "vid", storageProvider: "BUNNY", status: "READY" });

    expect(urls).toEqual({
      thumbnailUrl: "https://cdn.example.edu/vid/thumbnail.jpg",
      playbackUrl: "https://cdn.example.edu/vid/playlist.m3u8"
    });
    expect(mocks.nasMintDownloadUrl).not.toHaveBeenCalled();
  });
});
