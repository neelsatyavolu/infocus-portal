import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  sync: vi.fn(),
  role: vi.fn(),
  workspaces: vi.fn(),
  panels: vi.fn(),
  snapshot: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.sync }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...(await original<typeof import("@/src/lib/platform-admin")>()),
  getPlatformRoleForEmail: mocks.role
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { workspace: { findMany: mocks.workspaces } } }));
vi.mock("@/src/server/dashboard-data", () => ({
  getDashboardData: mocks.panels,
  loadStudentDashboardSnapshot: mocks.snapshot
}));
vi.mock("@/src/server/workspace-access", () => ({ buildWorkspaceAccessWhere: () => ({ id: "visible" }) }));

import { GET } from "@/app/api/app/home/route";

const upNext = { cycleNumber: 2, groupTopic: "Club Fair", stages: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.sync.mockResolvedValue({ id: "user-1", name: "Sage Example", nickname: null, email: "sage@example.edu" });
  mocks.workspaces.mockResolvedValue([
    { id: "ws-1", name: "InFocus", projects: [{ id: "p1", name: "Club Fair", updatedAt: new Date("2026-10-01T00:00:00Z"), _count: { mediaItems: 3 } }] }
  ]);
  mocks.panels.mockResolvedValue({ upNext, activity: [] });
  mocks.snapshot.mockResolvedValue({ letter: "A", percentage: 95 });
});

describe("GET /api/app/home", () => {
  it("gives a student up next, activity and the grade snapshot", async () => {
    mocks.role.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.data).toEqual({
      upNext,
      activity: [],
      snapshot: { letter: "A", percentage: 95 },
      workspaces: [{ id: "ws-1", name: "InFocus", projects: [{ id: "p1", name: "Club Fair", updatedAt: "2026-10-01T00:00:00.000Z", mediaCount: 3 }] }]
    });
    expect(mocks.panels).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", workspaceIds: ["ws-1"] }));
  });

  it("skips the student snapshot for producers who manage workspaces", async () => {
    mocks.role.mockResolvedValue("EXECUTIVE_PRODUCER");
    const body = await (await GET()).json();
    expect(body.data.snapshot).toBeNull();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("gives the App Review account its projects but no snapshot", async () => {
    vi.stubEnv("APP_REVIEW_EMAIL", "sage@example.edu");
    mocks.role.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.data.snapshot).toBeNull();
    expect(body.data.workspaces).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it("needs a signed-in member", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await GET()).status).toBe(401);
  });
});
