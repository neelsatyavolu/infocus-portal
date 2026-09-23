import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/prisma", () => ({ prisma: { publishingManager: { findUnique } } }));
import { isPublishingManager, requirePublishingViewer } from "@/src/server/publishing-access";

describe("publishing viewer access", () => {
  beforeEach(() => { vi.clearAllMocks(); findUnique.mockResolvedValue(null); });

  it.each(["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] as const)("allows %s without an appointment", async (role) => {
    await expect(requirePublishingViewer("producer", role)).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows an appointed reporter to view publications", async () => {
    findUnique.mockResolvedValue({ id: "appointment" });
    await expect(requirePublishingViewer("reporter", null)).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "reporter" }, select: { id: true } });
  });

  it("denies an unappointed reporter", async () => {
    await expect(requirePublishingViewer("reporter", null)).rejects.toThrow("FORBIDDEN");
  });

  it("rechecks appointments so removal revokes access", async () => {
    findUnique.mockResolvedValueOnce({ id: "appointment" }).mockResolvedValueOnce(null);
    expect(await isPublishingManager("reporter")).toBe(true);
    await expect(requirePublishingViewer("reporter", null)).rejects.toThrow("FORBIDDEN");
  });
});
