import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.PLATFORM_SUPER_ADMIN_EMAIL = "superadmin@example.edu";
  return {
    requireUserId: vi.fn(),
    syncUserProfile: vi.fn(),
    getPlatformAccess: vi.fn(),
    revokeNasUsers: vi.fn(),
    userFindUnique: vi.fn(),
    userFindFirst: vi.fn(),
    userUpdate: vi.fn(),
    userDelete: vi.fn(),
    roleFindUnique: vi.fn(),
    roleDeleteMany: vi.fn(),
    allowlistDeleteMany: vi.fn(),
    shareDeleteMany: vi.fn()
  };
});

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return { ...actual, getPlatformAccess: mocks.getPlatformAccess };
});
vi.mock("@/src/lib/drive-user-sync", () => ({ revokeNasUsers: mocks.revokeNasUsers }));
vi.mock("@/src/lib/rate-limit", () => ({ getRequestKey: () => "key", limitByKey: () => ({ allowed: true }) }));
vi.mock("@/src/lib/prisma", () => {
  const client = {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
      delete: mocks.userDelete
    },
    platformRoleAssignment: { findUnique: mocks.roleFindUnique, deleteMany: mocks.roleDeleteMany },
    allowedSignupEmail: { deleteMany: mocks.allowlistDeleteMany },
    vaultEntryShare: { deleteMany: mocks.shareDeleteMany }
  };
  return {
    prisma: {
      ...client,
      $transaction: async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof client) => Promise<unknown>)(client)
    }
  };
});

import { DELETE as deleteUser } from "@/app/api/platform/users/[userId]/route";
import { DELETE as deleteAllowedEmail } from "@/app/api/platform/allowed-emails/route";

const EP_ACCESS = { role: "EXECUTIVE_PRODUCER", canManageAllowedEmails: true, canManageAccounts: true, canManagePlatformRoles: false };
const ADVISER_ACCESS = { role: "ADVISER", canManageAllowedEmails: true, canManageAccounts: true, canManagePlatformRoles: true };

function removeById(id: string) {
  return deleteUser(new Request(`http://localhost/api/platform/users/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ userId: id })
  });
}
function legacyRemove(query: string) {
  return deleteAllowedEmail(new Request(`http://localhost/api/platform/allowed-emails?${query}`, { method: "DELETE" }));
}
function expectNoSideEffects() {
  expect(mocks.userDelete).not.toHaveBeenCalled();
  expect(mocks.userUpdate).not.toHaveBeenCalled();
  expect(mocks.roleDeleteMany).not.toHaveBeenCalled();
  expect(mocks.allowlistDeleteMany).not.toHaveBeenCalled();
  expect(mocks.shareDeleteMany).not.toHaveBeenCalled();
  expect(mocks.revokeNasUsers).not.toHaveBeenCalled();
}

const sage = { id: "user-sage", email: "sage@example.edu" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-ep");
  mocks.syncUserProfile.mockResolvedValue({ id: "user-ep", email: "abby@example.edu" });
  mocks.getPlatformAccess.mockResolvedValue(EP_ACCESS);
  mocks.userFindUnique.mockResolvedValue(sage);
  mocks.userFindFirst.mockResolvedValue(sage);
  mocks.roleFindUnique.mockResolvedValue({ role: "ADVISER" });
});

describe("account removal respects the role ceiling", () => {
  it("an EP cannot remove an adviser through either route", async () => {
    expect((await removeById(sage.id)).status).toBe(403);
    expect((await legacyRemove(`id=${sage.id}`)).status).toBe(403);
    expect((await legacyRemove(`email=${sage.email}`)).status).toBe(403);
    expectNoSideEffects();
  });

  it("an EP cannot remove another EP", async () => {
    mocks.roleFindUnique.mockResolvedValue({ role: "EXECUTIVE_PRODUCER" });
    expect((await removeById(sage.id)).status).toBe(403);
    expect((await legacyRemove(`email=${sage.email}`)).status).toBe(403);
    expectNoSideEffects();
  });

  it("an EP can still remove an associate producer", async () => {
    mocks.roleFindUnique.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    expect((await removeById(sage.id)).status).toBe(200);
    expect((await legacyRemove(`id=${sage.id}`)).status).toBe(200);
    expect((await legacyRemove(`email=${sage.email}`)).status).toBe(200);
  });

  it("an EP cannot remove an orphan allowlisted email that holds a role", async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    expect((await legacyRemove(`email=${sage.email}`)).status).toBe(403);
    expectNoSideEffects();
  });

  it("nobody can remove a hardcoded admin", async () => {
    mocks.getPlatformAccess.mockResolvedValue(ADVISER_ACCESS);
    const admin = { id: "user-admin", email: "superadmin@example.edu" };
    mocks.userFindUnique.mockResolvedValue(admin);
    mocks.userFindFirst.mockResolvedValue(admin);
    expect((await removeById(admin.id)).status).toBe(403);
    expect((await legacyRemove(`id=${admin.id}`)).status).toBe(403);
    expect((await legacyRemove(`email=${admin.email}`)).status).toBe(403);
    expectNoSideEffects();
  });

  it("an adviser can remove an adviser, and the vault shares go too", async () => {
    mocks.getPlatformAccess.mockResolvedValue(ADVISER_ACCESS);
    expect((await removeById(sage.id)).status).toBe(200);
    expect(mocks.shareDeleteMany).toHaveBeenCalledWith({ where: { userId: sage.id } });
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: sage.id } });
  });

  it("an EP can still remove someone with no role, and the vault shares go too", async () => {
    mocks.roleFindUnique.mockResolvedValue(null);
    expect((await removeById(sage.id)).status).toBe(200);
    expect(mocks.shareDeleteMany).toHaveBeenLastCalledWith({ where: { userId: sage.id } });

    expect((await legacyRemove(`id=${sage.id}`)).status).toBe(200);
    expect(mocks.shareDeleteMany).toHaveBeenLastCalledWith({ where: { userId: sage.id } });

    expect((await legacyRemove(`email=${sage.email}`)).status).toBe(200);
    expect(mocks.shareDeleteMany).toHaveBeenCalledTimes(3);
  });
});
