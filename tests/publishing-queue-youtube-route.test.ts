import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  startYoutubePublication: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return { ...actual, getPlatformAccess: mocks.getPlatformAccess };
});

vi.mock("@/src/server/youtube-publishing", () => ({
  startYoutubePublication: mocks.startYoutubePublication
}));

import { POST } from "@/app/api/package-cycle/queue/[rowId]/youtube/route";

const call = () => POST(new Request("http://localhost/api/package-cycle/queue/row_1/youtube", { method: "POST" }),
  { params: Promise.resolve({ rowId: "row_1" }) });

describe("publishing queue manual YouTube publish route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user_1");
    mocks.syncUserProfile.mockResolvedValue({ email: "producer@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.startYoutubePublication.mockResolvedValue(null);
  });

  it("starts the upload for producers", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(mocks.startYoutubePublication).toHaveBeenCalledWith("row_1");
  });

  it("forbids website managers and other non-producers", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    const response = await call();
    expect(response.status).toBe(403);
    expect(mocks.startYoutubePublication).not.toHaveBeenCalled();
  });

  it("returns the reason when the package cannot publish", async () => {
    mocks.startYoutubePublication.mockResolvedValue("The final cut is not ready to publish.");
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe("The final cut is not ready to publish.");
  });
});
