import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  rowFindUnique: vi.fn(),
  versionFindUnique: vi.fn(),
  resolveOriginalDownloadUrl: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return { ...actual, getPlatformAccess: mocks.getPlatformAccess };
});

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findUnique: mocks.rowFindUnique },
    mediaVersion: { findUnique: mocks.versionFindUnique }
  }
}));

vi.mock("@/src/lib/media-playback", () => ({
  resolveOriginalDownloadUrl: mocks.resolveOriginalDownloadUrl
}));

import { GET, HEAD } from "@/app/api/package-cycle/cuts/[rowId]/download/route";

function version(options: { mediaItemId?: string; status?: string; deletedAt?: Date | null } = {}) {
  return {
    id: "v1",
    status: options.status ?? "READY",
    bunnyVideoId: "nas_v1",
    storageProvider: "NAS",
    nasPath: "Package Storage/Cycle 1/Initial Cut/Airport Day/v1/cut.mp4",
    storageSizeBytes: BigInt(1000),
    updatedAt: new Date("2026-10-01T12:00:00Z"),
    mediaItem: { id: options.mediaItemId ?? "initial_1", title: "Airport Day", deletedAt: options.deletedAt ?? null }
  };
}

function call(handler: typeof GET, query = "?version=v1") {
  return handler(new Request(`https://infocus.test/api/package-cycle/cuts/row_1/download${query}`), {
    params: Promise.resolve({ rowId: "row_1" })
  });
}

describe("cut download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("student_1");
    mocks.syncUserProfile.mockResolvedValue({ email: "abby@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.rowFindUnique.mockResolvedValue({
      initialCutMediaItemId: "initial_1",
      finalCutMediaItemId: "final_1",
      members: [{ userId: "student_1" }]
    });
    mocks.versionFindUnique.mockResolvedValue(version());
    mocks.resolveOriginalDownloadUrl.mockResolvedValue("https://drive.example.edu/file?sig=1");
  });

  it("redirects a member to the original of an older Initial Cut version, saved as a file", async () => {
    const response = await call(GET);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://drive.example.edu/file?sig=1&inline=0");
  });

  it("serves the Final Cut too", async () => {
    mocks.versionFindUnique.mockResolvedValue(version({ mediaItemId: "final_1" }));
    expect((await call(GET)).status).toBe(302);
  });

  it("refuses someone who is not on the package and not a producer", async () => {
    mocks.requireUserId.mockResolvedValue("student_2");
    expect((await call(GET)).status).toBe(403);
  });

  it("lets a producer download any package's cut", async () => {
    mocks.requireUserId.mockResolvedValue("producer_1");
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    expect((await call(GET)).status).toBe(302);
  });

  it("refuses a version that belongs to some other media", async () => {
    mocks.versionFindUnique.mockResolvedValue(version({ mediaItemId: "someone_elses" }));
    expect((await call(GET)).status).toBe(404);
  });

  it("refuses a deleted cut and a version still processing", async () => {
    mocks.versionFindUnique.mockResolvedValue(version({ deletedAt: new Date() }));
    expect((await call(GET)).status).toBe(404);
    mocks.versionFindUnique.mockResolvedValue(version({ status: "PROCESSING" }));
    expect((await call(GET)).status).toBe(409);
  });

  it("puts the refusal in a header on HEAD so the page can toast it", async () => {
    mocks.versionFindUnique.mockResolvedValue(version({ status: "PROCESSING" }));
    const response = await call(HEAD);
    expect(response.status).toBe(409);
    expect(decodeURIComponent(response.headers.get("x-infocus-error-message") ?? "")).toBe(
      "That version is not ready to download yet."
    );
  });

  it("asks for a version", async () => {
    expect((await call(GET, "")).status).toBe(400);
  });
});
