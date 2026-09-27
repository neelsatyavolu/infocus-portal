import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ equipment: vi.fn(), livestream: vi.fn(), publishing: vi.fn(), social: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  equipmentManager: { findMany: rows.equipment },
  livestreamManager: { findMany: rows.livestream },
  publishingManager: { findMany: rows.publishing },
  socialMediaManager: { findMany: rows.social }
} }));
import { loadManagerRosters } from "@/src/server/manager-rosters";

const person = (userId: string, user: { name: string | null; nickname: string | null; email: string | null }) => ({ userId, user });

describe("manager rosters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(rows)) fn.mockResolvedValue([]);
  });

  it("loads each roster with display names, preferring nicknames", async () => {
    rows.equipment.mockResolvedValue([person("abby", { name: "Abigail Full", nickname: "Abby", email: "abby@example.edu" })]);
    rows.social.mockResolvedValue([person("sage", { name: "Sage Full", nickname: null, email: "sage@example.edu" })]);
    const rosters = await loadManagerRosters();
    expect(rosters.equipment).toEqual([{ userId: "abby", name: "Abby" }]);
    expect(rosters["social-media"]).toEqual([{ userId: "sage", name: "Sage Full" }]);
    expect(rosters.livestreams).toEqual([]);
    expect(rosters.website).toEqual([]);
  });

  it("never shows an email as a name", async () => {
    rows.publishing.mockResolvedValue([person("otto", { name: null, nickname: " ", email: "otto@example.edu" })]);
    expect((await loadManagerRosters()).website).toEqual([{ userId: "otto", name: "A member" }]);
  });

  it("orders appointments oldest first", async () => {
    await loadManagerRosters();
    expect(rows.livestream).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "asc" } }));
  });
});
