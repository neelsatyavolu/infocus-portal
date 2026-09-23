import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(), load: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.getPlatformAccess,
  isExecutiveProducer: (role: string | null) => ["EXECUTIVE_PRODUCER", "SUPER_ADMIN"].includes(role ?? ""),
  hasPlatformRole: (role: string | null) => ["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"].includes(role ?? "")
}));
vi.mock("@/src/server/associate-performance", () => ({ loadAssociatePerformance: mocks.load }));
vi.mock("@/src/server/program-settings", () => ({ MAX_CYCLES_PER_SEMESTER: 12 }));
import { GET } from "@/app/api/groups/associates/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("viewer");
  mocks.syncUserProfile.mockResolvedValue({ email: "viewer@example.com" });
  mocks.load.mockResolvedValue({ cycleNumber: 2, associates: [] });
});
describe("Associates API", () => {
  it.each([null, "ASSOCIATE_PRODUCER"])("rejects %s before querying performance", async (role) => {
    mocks.getPlatformAccess.mockResolvedValue({ role });
    expect((await GET(new Request("http://test/api/groups/associates?cycle=2"))).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"])("allows %s", async (role) => {
    mocks.getPlatformAccess.mockResolvedValue({ role });
    expect((await GET(new Request("http://test/api/groups/associates?cycle=2"))).status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(2, { includeGroupFeedback: role !== "ADVISER" });
  });
  it.each(["", "0", "-1", "1.5", "nope", "999"])("rejects invalid cycle %s", async (cycle) => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ADVISER" });
    expect((await GET(new Request(`http://test/api/groups/associates?cycle=${cycle}`))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await GET(new Request("http://test/api/groups/associates?cycle=2"))).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
});

it.each([null, "ASSOCIATE_PRODUCER"])("blocks %s from AI evaluations and private reviews", async (role) => {
  mocks.getPlatformAccess.mockResolvedValue({ role });
  const { POST } = await import("@/app/api/groups/associates/route");
  const response = await POST(new Request("http://test/api/groups/associates", { method: "POST", body: JSON.stringify({ cycle: 1, userId: "ap" }) }));
  expect(response.status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
