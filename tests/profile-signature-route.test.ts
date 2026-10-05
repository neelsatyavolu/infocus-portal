import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  real: vi.fn(),
  session: vi.fn(),
  access: vi.fn(),
  allowed: vi.fn(),
  findSignature: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  findUsers: vi.fn(),
  executives: vi.fn(),
  roleHolders: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: mocks.real, getSessionUser: mocks.session }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...(await original<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: mocks.access,
  isEmailAllowedToUsePlatform: mocks.allowed
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    userSignature: { findUnique: mocks.findSignature, upsert: mocks.upsert, deleteMany: mocks.deleteMany },
    user: { findMany: mocks.findUsers }
  }
}));
vi.mock("@/src/server/package-progress-data", () => ({
  loadAssignableExecutiveProducers: mocks.executives,
  loadExecutiveProducerRoleUsers: mocks.roleHolders
}));

import { DELETE, GET, PUT } from "@/app/api/profile/signature/route";
import { loadCertificateSigners } from "@/src/server/user-signature";

function png(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/profile/signature", { method: "PUT", body: JSON.stringify(body) }));

const executive = { userId: "ep-1", email: "abby@example.edu" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.real.mockResolvedValue(executive);
  mocks.session.mockResolvedValue(executive);
  mocks.allowed.mockResolvedValue(true);
  mocks.access.mockResolvedValue({ role: "EXECUTIVE_PRODUCER" });
  mocks.findSignature.mockResolvedValue(null);
});

describe("/api/profile/signature", () => {
  it("lets an executive producer load their signature", async () => {
    mocks.findSignature.mockResolvedValue({ imageData: png(400, 100) });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ signature: png(400, 100) });
  });

  it("lets the super admin draw one too", async () => {
    mocks.access.mockResolvedValue({ role: "SUPER_ADMIN" });
    expect((await GET()).status).toBe(200);
  });

  it("hides the section from associate producers and the adviser", async () => {
    mocks.access.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    expect((await GET()).status).toBe(403);
    mocks.access.mockResolvedValue({ role: "ADVISER" });
    expect((await GET()).status).toBe(403);
  });

  it("never lets View as save a signature for someone else", async () => {
    mocks.session.mockResolvedValue({ userId: "ep-2", email: "otto@example.edu" });
    expect((await put({ signature: png(400, 100) })).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves a PNG signature for the signed-in executive", async () => {
    const response = await put({ signature: png(400, 100) });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId: "ep-1" },
      create: { userId: "ep-1", imageData: png(400, 100) },
      update: { imageData: png(400, 100) }
    });
  });

  it("refuses anything that isn't a PNG data URL", async () => {
    const response = await put({ signature: "data:image/svg+xml;base64,PHN2Zz4=" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/draw it again/);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect((await put({})).status).toBe(400);
  });

  it("removes the signature", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "ep-1" } });
  });
});

describe("certificate signers", () => {
  it("prints the first three executives by name with full names and their signatures", async () => {
    const executives = [
      { userId: "ep-1", name: "Abby" },
      { userId: "ep-2", name: "Otto" },
      { userId: "ep-3", name: "Sage" },
      { userId: "ep-4", name: "Zed" }
    ];
    mocks.executives.mockResolvedValue(executives);
    mocks.roleHolders.mockResolvedValue(executives);
    mocks.findUsers.mockResolvedValue([
      { id: "ep-1", name: "Abby Example", signature: { imageData: png(400, 100) } },
      { id: "ep-2", name: "Otto Example", signature: null },
      { id: "ep-3", name: null, signature: { imageData: "data:image/png;base64,broken" } }
    ]);

    const signers = await loadCertificateSigners();

    expect(mocks.findUsers).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["ep-1", "ep-2", "ep-3"] } } })
    );
    expect(signers).toEqual([
      { name: "Abby Example", signature: { src: png(400, 100), width: 400, height: 100 } },
      { name: "Otto Example", signature: null },
      { name: "Sage", signature: null }
    ]);
  });

  it("only gives the super admin a line that no executive producer takes", async () => {
    const roleHolders = [
      { userId: "ep-1", name: "Otto" },
      { userId: "ep-2", name: "Sage" },
      { userId: "ep-3", name: "Zed" }
    ];
    mocks.roleHolders.mockResolvedValue(roleHolders);
    mocks.executives.mockResolvedValue([{ userId: "admin", name: "Abby" }, ...roleHolders]);
    mocks.findUsers.mockResolvedValue([]);
    expect((await loadCertificateSigners()).map((signer) => signer.name)).toEqual(["Otto", "Sage", "Zed"]);

    mocks.roleHolders.mockResolvedValue(roleHolders.slice(0, 2));
    mocks.executives.mockResolvedValue([{ userId: "admin", name: "Abby" }, ...roleHolders.slice(0, 2)]);
    expect((await loadCertificateSigners()).map((signer) => signer.name)).toEqual(["Abby", "Otto", "Sage"]);
  });
});
