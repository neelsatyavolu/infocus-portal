import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/prisma", () => ({ prisma: { socialMediaManager: { findUnique } } }));
import { canUseStoryMaker, isSocialMediaManager } from "@/src/server/social-media-access";

describe("social media manager access", () => {
  beforeEach(() => { vi.clearAllMocks(); findUnique.mockResolvedValue(null); });

  it.each(["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] as const)("lets %s use the Story Maker without an appointment", async (role) => {
    expect(await canUseStoryMaker("producer", role)).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("lets an appointed social media manager use the Story Maker", async () => {
    findUnique.mockResolvedValue({ id: "appointment" });
    expect(await canUseStoryMaker("reporter", null)).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "reporter" }, select: { id: true } });
  });

  it("denies an unappointed reporter", async () => {
    expect(await canUseStoryMaker("reporter", null)).toBe(false);
  });

  it("rechecks appointments so removal revokes access", async () => {
    findUnique.mockResolvedValueOnce({ id: "appointment" }).mockResolvedValueOnce(null);
    expect(await isSocialMediaManager("reporter")).toBe(true);
    expect(await canUseStoryMaker("reporter", null)).toBe(false);
  });
});
