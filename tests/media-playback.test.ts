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
  resolveThumbnailUrl,
  resolveThumbnailUrls
} from "@/src/lib/media-playback";
import { serializeMediaRows } from "@/src/server/media-json";

const FILE_URL =
  "https://drive.infocusportal.com/api/service/file?path=Package%20Storage%2FCycle%201%2FJeffDay.mov&token=tok";

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

describe("bounded poster minting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function trackConcurrency() {
    const stats = { inFlight: 0, peak: 0 };
    mocks.nasMintDownloadUrl.mockImplementation(async () => {
      stats.inFlight += 1;
      stats.peak = Math.max(stats.peak, stats.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      stats.inFlight -= 1;
      return FILE_URL;
    });
    return stats;
  }

  it("mints each version once and at most five at a time", async () => {
    const stats = trackConcurrency();
    const versions = Array.from({ length: 30 }, (_, i) => ({ ...nasVersion, id: `v${i % 20}` }));
    const posters = await resolveThumbnailUrls(versions);
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledTimes(20);
    expect(stats.peak).toBeLessThanOrEqual(5);
    expect(posters.size).toBe(20);
  });

  it("does not mint currentVersion a second time when serializing rows", async () => {
    const stats = trackConcurrency();
    const rows = Array.from({ length: 10 }, (_, i) => {
      const versions = [1, 2, 3].map((n) => ({
        ...nasVersion,
        id: `m${i}v${n}`,
        sourceType: "VIDEO",
        storageSizeBytes: BigInt(n)
      }));
      return { id: `m${i}`, versions, currentVersion: versions[2] };
    });
    const json = await serializeMediaRows(rows);
    expect(mocks.nasMintDownloadUrl).toHaveBeenCalledTimes(30);
    expect(stats.peak).toBeLessThanOrEqual(5);
    expect(json[0].currentVersion?.thumbnailUrl).toContain("/api/service/thumbnail");
    expect(json[0].versions[0].storageSizeBytes).toBe(1);
  });
});
