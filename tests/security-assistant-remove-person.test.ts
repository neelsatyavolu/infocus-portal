import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "test-assistant-secret-key";
  return {
    revokeNasUsers: vi.fn(),
    userFindUnique: vi.fn(),
    userDelete: vi.fn(),
    roleDeleteMany: vi.fn(),
    allowlistDeleteMany: vi.fn(),
    shareDeleteMany: vi.fn()
  };
});

vi.mock("@/src/lib/drive-user-sync", () => ({ revokeNasUsers: mocks.revokeNasUsers }));
vi.mock("@/src/lib/prisma", () => {
  const client = {
    user: { findUnique: mocks.userFindUnique, delete: mocks.userDelete },
    platformRoleAssignment: { deleteMany: mocks.roleDeleteMany },
    allowedSignupEmail: { deleteMany: mocks.allowlistDeleteMany },
    vaultEntryShare: { deleteMany: mocks.shareDeleteMany }
  };
  return {
    prisma: {
      ...client,
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client)
    }
  };
});

import { createAssistantActionPreview, executeAssistantAction } from "@/src/server/assistant-actions";

const otto = { id: "user-otto", email: "otto@example.edu", name: "Otto", nickname: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(otto);
});

describe("assistant remove_person revokes like DELETE /api/platform/users/[userId]", () => {
  it("deletes the allowlist row, role, vault shares and user, then revokes the NAS account", async () => {
    const preview = createAssistantActionPreview("user-admin", "remove_person", { userId: otto.id }, "Remove person", []);
    const result = await executeAssistantAction({
      actorUserId: "user-admin",
      token: preview.token,
      appBaseUrl: "https://portal.example.edu",
      inviterName: "Abby"
    });

    expect(result.message).toContain("Removed");
    expect(mocks.roleDeleteMany).toHaveBeenCalledWith({ where: { email: otto.email } });
    expect(mocks.allowlistDeleteMany).toHaveBeenCalledWith({ where: { email: otto.email } });
    expect(mocks.shareDeleteMany).toHaveBeenCalledWith({ where: { userId: otto.id } });
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: otto.id } });
    expect(mocks.revokeNasUsers).toHaveBeenCalledTimes(1);
    expect(mocks.revokeNasUsers).toHaveBeenCalledWith([otto.email]);
  });
});
