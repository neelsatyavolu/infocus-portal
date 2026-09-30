import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(),
  manager: vi.fn(), rows: vi.fn(), setQueuedForAir: vi.fn(), currentUser: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/current-app-user", () => ({ getCurrentAppUser: mocks.currentUser }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  publishingManager: { findUnique: mocks.manager },
  packageProgressRow: { findMany: mocks.rows }
} }));
vi.mock("@/src/server/publishing-queue", () => ({ setQueuedForAir: mocks.setQueuedForAir }));
vi.mock("@/src/server/show-schedule", () => ({ listUpcomingShowDays: async () => [] }));
vi.mock("@/src/server/youtube-client", () => ({ youtubePublishingConfig: () => null }));
vi.mock("@/src/lib/media-playback", () => ({ resolveThumbnailUrl: async () => null }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { GET, POST } from "@/app/api/package-cycle/queue/route";
import PublishingQueuePage from "@/app/(app)/publishing-queue/page";

const get = (query = "") => GET(new Request(`https://infocus.test/api/package-cycle/queue${query}`));
const post = () => POST(new Request("https://infocus.test/api/package-cycle/queue", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowId: "row", queued: false })
}));

function asRole(role: string | null, appointed: boolean) {
  mocks.getPlatformAccess.mockResolvedValue({ role });
  mocks.currentUser.mockResolvedValue({ userId: "viewer", platformRole: role });
  mocks.manager.mockResolvedValue(appointed ? { id: "appointment" } : null);
}

describe("publishing queue for website managers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("viewer");
    mocks.syncUserProfile.mockResolvedValue({ id: "viewer", email: "viewer@example.test" });
    mocks.rows.mockResolvedValue([]);
  });

  it("lets an appointed website manager read the queue, read-only", async () => {
    asRole(null, true);
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json()).data.canEdit).toBe(false);
  });

  it("never gives website managers the unqueued package list", async () => {
    asRole(null, true);
    const body = (await (await get("?candidates=1")).json()).data;
    expect(body.candidates).toEqual([]);
    expect(mocks.rows).toHaveBeenCalledTimes(1);
  });

  it("gives producers the editable queue and candidates", async () => {
    asRole("ASSOCIATE_PRODUCER", false);
    const body = (await (await get("?candidates=1")).json()).data;
    expect(body.canEdit).toBe(true);
    expect(mocks.rows).toHaveBeenCalledTimes(2);
    expect(mocks.manager).not.toHaveBeenCalled();
  });

  it("blocks members who are neither producers nor website managers", async () => {
    asRole(null, false);
    expect((await get()).status).toBe(403);
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it("keeps queue changes producer-only", async () => {
    asRole(null, true);
    expect((await post()).status).toBe(403);
    expect(mocks.setQueuedForAir).not.toHaveBeenCalled();
  });

  it("opens the page read-only for website managers and editable for producers", async () => {
    asRole(null, true);
    expect(((await PublishingQueuePage()) as { props: { canEdit: boolean } }).props.canEdit).toBe(false);
    asRole("ASSOCIATE_PRODUCER", false);
    expect(((await PublishingQueuePage()) as { props: { canEdit: boolean } }).props.canEdit).toBe(true);
  });

  it("sends everyone else to access denied", async () => {
    asRole(null, false);
    await expect(PublishingQueuePage()).rejects.toThrow("REDIRECT:/access-denied");
  });
});
