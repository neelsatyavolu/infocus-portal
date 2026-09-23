import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  findUnique: vi.fn(),
  resolveOriginalDownloadUrl: vi.fn()
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

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: {
      findUnique: mocks.findUnique
    }
  }
}));

vi.mock("@/src/lib/media-playback", () => ({
  resolveOriginalDownloadUrl: mocks.resolveOriginalDownloadUrl
}));

import { GET } from "@/app/api/package-cycle/queue/[rowId]/download/route";

describe("publishing queue final-cut download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user_1");
    mocks.syncUserProfile.mockResolvedValue({ email: "producer@infocus.test" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.findUnique.mockResolvedValue({
      finalCutMediaItem: {
        currentVersion: { id: "version_1", nasPath: "Package Storage/Cycle 1/Airport Day/Final Cut/cut.mp4" }
      }
    });
    mocks.resolveOriginalDownloadUrl.mockResolvedValue("https://drive.infocus.test/cut.mp4?token=stub");
  });

  it("redirects producers to the signed final-cut URL", async () => {
    const response = await GET(new Request("https://infocus.test/api/package-cycle/queue/row_1/download"), {
      params: Promise.resolve({ rowId: "row_1" })
    });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "row_1" },
      select: {
        finalCutMediaItem: {
          select: { currentVersion: true }
        }
      }
    });
    expect(mocks.resolveOriginalDownloadUrl).toHaveBeenCalledWith({
      id: "version_1",
      nasPath: "Package Storage/Cycle 1/Airport Day/Final Cut/cut.mp4"
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://drive.infocus.test/cut.mp4?token=stub");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("forbids students", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });

    const response = await GET(new Request("https://infocus.test/api/package-cycle/queue/row_1/download"), {
      params: Promise.resolve({ rowId: "row_1" })
    });

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns 409 when the row has no final cut", async () => {
    mocks.findUnique.mockResolvedValue({ finalCutMediaItem: null });

    const response = await GET(new Request("https://infocus.test/api/package-cycle/queue/row_1/download"), {
      params: Promise.resolve({ rowId: "row_1" })
    });

    expect(response.status).toBe(409);
  });
});
