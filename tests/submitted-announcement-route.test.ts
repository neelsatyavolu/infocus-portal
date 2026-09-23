import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), access: vi.fn(), remove: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.user, syncUserProfile: mocks.profile }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.access,
  hasPlatformRole: (role: string | null) => ["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"].includes(role ?? "")
}));
vi.mock("@/src/server/announcement-submissions", () => ({ deleteSubmittedAnnouncement: mocks.remove, fetchSubmittedAnnouncements: vi.fn() }));
import { DELETE } from "@/app/api/announcements/submitted/route";
function request(body: unknown = { id: "announcement-1" }) {
  return new Request("https://example.com/api/announcements/submitted", { method: "DELETE", body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue("user");
  mocks.profile.mockResolvedValue({ email: "producer@example.com" });
  mocks.access.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
});
describe("submitted announcement DELETE", () => {
  it("requires login", async () => {
    mocks.user.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await DELETE(request())).status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects viewers without a producer role", async () => {
    mocks.access.mockResolvedValue({ role: null });
    expect((await DELETE(request())).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each(["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"])("allows %s", async (role) => {
    mocks.access.mockResolvedValue({ role });
    expect((await DELETE(request())).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("announcement-1");
  });
  it("rejects malformed input before deletion", async () => {
    expect((await DELETE(request({ id: "" }))).status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
