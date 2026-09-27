import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(),
  managers: vi.fn(), candidates: vi.fn(), target: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  socialMediaManager: { findMany: mocks.managers, upsert: mocks.upsert, deleteMany: mocks.deleteMany },
  user: { findMany: mocks.candidates, findUnique: mocks.target }
} }));
vi.mock("@/src/lib/rate-limit", () => ({ getRequestKey: () => "test", limitByKey: () => ({ allowed: true }) }));
import { DELETE, GET, POST } from "@/app/api/managers/social-media/route";

const URL_BASE = "https://infocus.test/api/managers/social-media";
const request = (body: unknown) => new Request(URL_BASE, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

describe("social media managers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("producer");
    mocks.syncUserProfile.mockResolvedValue({ id: "producer", email: "producer@example.test" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.managers.mockResolvedValue([]);
    mocks.candidates.mockResolvedValue([]);
    mocks.target.mockResolvedValue({ id: "reporter", name: "Full Name", nickname: "Nick", email: "reporter@example.test" });
  });

  it("lists appointed managers and registered candidates by display name", async () => {
    mocks.managers.mockResolvedValue([{ userId: "sage", user: { id: "sage", name: "Sage Full", nickname: "Sage", email: "sage@example.test" } }]);
    mocks.candidates.mockResolvedValue([{ id: "reporter", name: "Full Name", nickname: "Nick", email: "reporter@example.test" }]);
    const body = (await (await GET()).json()).data;
    expect(body.managers).toEqual([{ userId: "sage", name: "Sage", email: "sage@example.test" }]);
    expect(body.candidates).toEqual([{ id: "reporter", name: "Nick", email: "reporter@example.test" }]);
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { not: null } } }));
  });

  it("lets producers appoint a registered user idempotently", async () => {
    expect((await POST(request({ userId: "reporter" }))).status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { userId: "reporter" }, create: { userId: "reporter", createdByUserId: "producer" }, update: {} });
  });

  it.each([null, { id: "placeholder", email: null }])("rejects missing or unregistered targets", async (target) => {
    mocks.target.mockResolvedValue(target);
    expect((await POST(request({ userId: "placeholder" }))).status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid appointment input", async () => {
    expect((await POST(request({ userId: " " }))).status).toBe(400);
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it("removes only the appointment", async () => {
    expect((await DELETE(new Request(`${URL_BASE}?userId=reporter`))).status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "reporter" } });
  });

  it("does not let non-producers (even appointed managers) change the roster", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    expect((await GET()).status).toBe(403);
    expect((await POST(request({ userId: "reporter" }))).status).toBe(403);
    expect((await DELETE(new Request(`${URL_BASE}?userId=reporter`))).status).toBe(403);
    expect(mocks.managers).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
