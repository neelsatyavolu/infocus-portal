import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPublishingQueueNasPath } from "@/src/lib/nas-storage";
import {
  CUSTOM_QUEUE_CYCLE_NUMBER,
  CUSTOM_QUEUE_GROUP_TYPE,
  isCustomQueuePackage,
  queuePackageSubtitle
} from "@/src/lib/publishing-queue";

describe("custom publishing-queue packages", () => {
  it("treats cycle 0 / CUSTOM_QUEUE rows as custom", () => {
    expect(isCustomQueuePackage({ cycleNumber: 0, groupType: "" })).toBe(true);
    expect(isCustomQueuePackage({ cycleNumber: 1, groupType: CUSTOM_QUEUE_GROUP_TYPE })).toBe(true);
    expect(isCustomQueuePackage({ cycleNumber: 1, groupType: "News" })).toBe(false);
    expect(CUSTOM_QUEUE_CYCLE_NUMBER).toBe(0);
  });

  it("labels custom queue rows without a cycle", () => {
    expect(
      queuePackageSubtitle({
        custom: true,
        cycleNumber: 0,
        members: []
      })
    ).toBe("Custom");
    expect(
      queuePackageSubtitle({
        cycleNumber: 2,
        members: ["Ada", "Neel"]
      })
    ).toBe("Cycle 2 · Ada, Neel");
  });

  it("stores custom uploads under Package Storage / Publishing Queue / title", () => {
    expect(
      buildPublishingQueueNasPath({
        title: "Friday opener",
        fileName: "open.mp4"
      })
    ).toBe("Package Storage/Publishing Queue/Friday opener/open.mp4");
    expect(
      buildPublishingQueueNasPath({
        title: "Lee/Patel",
        fileName: "cut.mp4",
        versionNumber: 2
      })
    ).toBe("Package Storage/Publishing Queue/Lee-Patel/cut-v2.mp4");
  });
});

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  initCustomQueueUpload: vi.fn(),
  completeCustomQueueUpload: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return {
    ...actual,
    getPlatformAccess: mocks.getPlatformAccess
  };
});

vi.mock("@/src/server/publishing-queue-custom", () => ({
  initCustomQueueUpload: mocks.initCustomQueueUpload,
  completeCustomQueueUpload: mocks.completeCustomQueueUpload
}));

import { POST } from "@/app/api/package-cycle/queue/custom/route";

describe("custom publishing-queue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user_1");
    mocks.syncUserProfile.mockResolvedValue({ email: "producer@infocus.test" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.initCustomQueueUpload.mockResolvedValue({
      mediaId: "media_1",
      versionId: "version_1",
      upload: { provider: "NAS", uploadUrl: "https://drive.infocus.test/upload" }
    });
    mocks.completeCustomQueueUpload.mockResolvedValue({
      id: "row_1",
      queuedForShowDate: "2026-09-04",
      queuedForAirAt: new Date("2026-08-21T12:00:00.000Z")
    });
  });

  it("forbids students from uploading custom packages", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });

    const response = await POST(
      new Request("https://infocus.test/api/package-cycle/queue/custom", {
        method: "POST",
        body: JSON.stringify({ action: "init", title: "Opener", fileName: "open.mp4" })
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.initCustomQueueUpload).not.toHaveBeenCalled();
  });

  it("inits a custom upload for producers", async () => {
    const response = await POST(
      new Request("https://infocus.test/api/package-cycle/queue/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", title: "Opener", fileName: "open.mp4" })
      })
    );
    const body = (await response.json()) as { data?: { mediaId: string } };

    expect(response.status).toBe(200);
    expect(mocks.initCustomQueueUpload).toHaveBeenCalledWith({
      userId: "user_1",
      title: "Opener",
      fileName: "open.mp4"
    });
    expect(body.data?.mediaId).toBe("media_1");
  });

  it("queues the custom package on complete", async () => {
    const response = await POST(
      new Request("https://infocus.test/api/package-cycle/queue/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          title: "Opener",
          mediaId: "media_1",
          versionId: "version_1"
        })
      })
    );
    const body = (await response.json()) as { data?: { rowId: string; queuedForShowDate: string } };

    expect(response.status).toBe(200);
    expect(mocks.completeCustomQueueUpload).toHaveBeenCalledWith({
      userId: "user_1",
      title: "Opener",
      mediaId: "media_1",
      versionId: "version_1"
    });
    expect(body.data).toEqual({
      ok: true,
      rowId: "row_1",
      queuedForShowDate: "2026-09-04",
      queuedForAirAt: "2026-08-21T12:00:00.000Z"
    });
  });
});
