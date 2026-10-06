import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "user-1"),
  syncUserProfile: vi.fn(async () => ({ email: "ap@example.edu" }))
}));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: vi.fn(async () => ({ role: "ASSOCIATE_PRODUCER" })),
  hasPlatformRole: vi.fn(() => true)
}));
vi.mock("@/src/server/show-roles-history", () => ({
  withAssociateShowManagers: vi.fn(async (shows: unknown) => shows)
}));
vi.mock("@/src/lib/prisma", () => {
  const tx = {
    showRolesShow: { findMany: mocks.findMany, deleteMany: mocks.deleteMany, upsert: mocks.upsert }
  };
  return { prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

import { POST } from "@/app/api/show-roles/data/route";

function post(shows: unknown[]) {
  return POST(
    new Request("http://localhost/api/show-roles/data", {
      method: "POST",
      body: JSON.stringify({ shows })
    }) as never
  );
}

describe("POST /api/show-roles/data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only upserts shows that differ from what is stored", async () => {
    mocks.findMany.mockResolvedValue([
      { date: "2026-10-06", assignments: { TD: "Abby", Audio: "Otto" }, anchors: ["Sage"], confirmed: {} },
      { date: "2026-10-08", assignments: { TD: "Abby" }, anchors: [], confirmed: {} }
    ]);

    const response = await post([
      { date: "2026-10-06", assignments: { Audio: "Otto", TD: "Abby" }, anchors: ["Sage"], confirmed: {} },
      { date: "2026-10-08", assignments: { TD: "Otto" }, anchors: [], confirmed: {} },
      { date: "2026-10-10", assignments: {}, anchors: [], confirmed: {} }
    ]);

    expect(response.status).toBe(200);
    expect(mocks.upsert.mock.calls.map(([args]) => args.where.date)).toEqual(["2026-10-08", "2026-10-10"]);
  });

  it("keeps last-copy-wins for a repeated date", async () => {
    mocks.findMany.mockResolvedValue([
      { date: "2026-10-06", assignments: { TD: "Abby" }, anchors: [], confirmed: {} }
    ]);

    await post([
      { date: "2026-10-06", assignments: { TD: "Otto" }, anchors: [], confirmed: {} },
      { date: "2026-10-06", assignments: { TD: "Abby" }, anchors: [], confirmed: {} }
    ]);

    expect(mocks.upsert.mock.calls.map(([args]) => args.update.assignments)).toEqual([
      { TD: "Otto" },
      { TD: "Abby" }
    ]);
  });
});
