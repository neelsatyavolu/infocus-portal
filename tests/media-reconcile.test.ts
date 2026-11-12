import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  mediaVersion: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  reviewComment: { count: vi.fn() },
  mediaItem: { delete: vi.fn() }
}));
const bunny = vi.hoisted(() => ({ getBunnyVideo: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/bunny", () => ({
  getBunnyVideo: bunny.getBunnyVideo,
  deriveMediaStatusFromBunnyVideo: vi.fn(() => "READY")
}));
vi.mock("@/src/server/notify-media-ready", () => ({ notifyManagersOfReadyVersion: vi.fn() }));

import { reconcileProjectMediaStatuses } from "@/src/server/media-reconcile";

const BUNNY_ENV = {
  BUNNY_STREAM_LIBRARY_ID: "lib",
  BUNNY_STREAM_API_KEY: "key",
  BUNNY_STREAM_PULL_ZONE: "zone",
  BUNNY_STREAM_SIGNING_KEY: "sign"
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(BUNNY_ENV)) vi.stubEnv(key, value);
  db.mediaVersion.findMany.mockResolvedValue([]);
  db.mediaVersion.count.mockResolvedValue(1);
  db.reviewComment.count.mockResolvedValue(0);
  db.mediaVersion.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function bunnyVersion(id: string) {
  return { id, mediaItemId: `item-${id}`, bunnyVideoId: `guid-${id}`, storageProvider: "BUNNY", status: "PROCESSING" };
}

describe("reconcileProjectMediaStatuses", () => {
  it("returns early without throwing when Bunny isn't configured", async () => {
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    await expect(reconcileProjectMediaStatuses("project")).resolves.toBeUndefined();
    expect(db.mediaVersion.findMany).not.toHaveBeenCalled();
    expect(bunny.getBunnyVideo).not.toHaveBeenCalled();
  });

  it("only asks about Bunny versions", async () => {
    await reconcileProjectMediaStatuses("project");
    expect(db.mediaVersion.findMany.mock.calls[0][0].where.storageProvider).toBe("BUNNY");
  });

  it("never sends a NAS version to Bunny or deletes it", async () => {
    db.mediaVersion.findMany.mockResolvedValue([
      { id: "nas_abc123", mediaItemId: "item", bunnyVideoId: "nas:abc123", storageProvider: "NAS", status: "UPLOADING" }
    ]);
    bunny.getBunnyVideo.mockResolvedValue(null);
    await reconcileProjectMediaStatuses("project");
    expect(bunny.getBunnyVideo).not.toHaveBeenCalled();
    expect(db.mediaItem.delete).not.toHaveBeenCalled();
  });

  it("deletes a lone, uncommented Bunny upload Bunny no longer has", async () => {
    db.mediaVersion.findMany.mockResolvedValue([bunnyVersion("a")]);
    bunny.getBunnyVideo.mockResolvedValue(null);
    await reconcileProjectMediaStatuses("project");
    expect(db.mediaItem.delete).toHaveBeenCalledWith({ where: { id: "item-a" } });
  });

  it("keeps at most 5 Bunny fetches in flight", async () => {
    db.mediaVersion.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => bunnyVersion(String(i))));
    let inFlight = 0;
    let peak = 0;
    bunny.getBunnyVideo.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { status: 4, length: 10, width: 1920, height: 1080 };
    });
    await reconcileProjectMediaStatuses("project");
    expect(bunny.getBunnyVideo).toHaveBeenCalledTimes(12);
    expect(peak).toBe(5);
  });
});
