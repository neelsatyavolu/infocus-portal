import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  revokeNasUsers: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  roleDeleteMany: vi.fn(),
  allowlistDeleteMany: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile
}));

vi.mock("@/src/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/platform-admin")>();
  return { ...actual, getPlatformAccess: mocks.getPlatformAccess };
});

vi.mock("@/src/lib/drive-user-sync", () => ({
  revokeNasUsers: mocks.revokeNasUsers
}));

vi.mock("@/src/lib/prisma", () => {
  const client = {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
      delete: mocks.userDelete
    },
    platformRoleAssignment: { deleteMany: mocks.roleDeleteMany },
    allowedSignupEmail: { deleteMany: mocks.allowlistDeleteMany }
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

const target = { id: "user-otto", email: "otto@example.edu" };

describe("removing a person revokes every sign-in path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user-admin");
    mocks.syncUserProfile.mockResolvedValue({ id: "user-admin", email: "superadmin@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ canManageAllowedEmails: true, canManageAccounts: true });
    mocks.userFindUnique.mockResolvedValue(target);
    mocks.userFindFirst.mockResolvedValue(target);
  });

  it("Admin Remove clears the access-request allowlist entry", async () => {
    const response = await deleteUser(new Request("http://localhost/api/platform/users/user-otto", { method: "DELETE" }), {
      params: Promise.resolve({ userId: target.id })
    });

    expect(response.status).toBe(200);
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: target.id } });
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { email: target.email } });
    expect(mocks.allowlistDeleteMany).toHaveBeenCalledWith({ where: { email: target.email } });
  });

  it("legacy remove by id clears the allowlist entry and role", async () => {
    const response = await deleteAllowedEmail(
      new Request(`http://localhost/api/platform/allowed-emails?id=${target.id}`, { method: "DELETE" })
    );

    expect(response.status).toBe(200);
    expect(mocks.allowlistDeleteMany).toHaveBeenCalledWith({ where: { email: target.email } });
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { email: target.email } });
  });

  it("legacy remove by email clears the role too", async () => {
    const response = await deleteAllowedEmail(
      new Request(`http://localhost/api/platform/allowed-emails?email=${target.email}`, { method: "DELETE" })
    );

    expect(response.status).toBe(200);
    expect(mocks.allowlistDeleteMany).toHaveBeenCalledWith({ where: { email: target.email } });
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { email: target.email } });
  });
});
