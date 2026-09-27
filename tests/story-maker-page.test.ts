import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(), manager: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { socialMediaManager: { findUnique: mocks.manager } } }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/components/story-maker/story-maker", () => ({ StoryMaker: () => null }));
import SocialMediaManagerPage from "@/app/(app)/managers/social-media/page";

type PageElement = { props: { canAppoint: boolean } };

describe("Story Maker page access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("viewer");
    mocks.syncUserProfile.mockResolvedValue({ id: "viewer", email: "viewer@example.test" });
    mocks.manager.mockResolvedValue(null);
  });

  it("opens for producers, who can also appoint managers", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    expect(((await SocialMediaManagerPage()) as PageElement).props.canAppoint).toBe(true);
  });

  it("opens for appointed social media managers, who cannot appoint", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.manager.mockResolvedValue({ id: "appointment" });
    expect(((await SocialMediaManagerPage()) as PageElement).props.canAppoint).toBe(false);
  });

  it("sends everyone else to access denied", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    await expect(SocialMediaManagerPage()).rejects.toThrow("REDIRECT:/access-denied");
  });
});
