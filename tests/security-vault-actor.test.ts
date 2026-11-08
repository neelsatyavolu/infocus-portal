import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  real: vi.fn(),
  effective: vi.fn(),
  role: vi.fn(),
  allowed: vi.fn(),
  userFindUnique: vi.fn(),
  shareFindFirst: vi.fn()
}));

vi.mock("@/src/lib/env", () => ({ env: {} }));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: m.real, getSessionUser: m.effective }));
vi.mock("@/src/lib/platform-admin", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/platform-admin")>("@/src/lib/platform-admin");
  return {
    hasPlatformRole: actual.hasPlatformRole,
    getPlatformRoleForEmail: m.role,
    isEmailAllowedToUsePlatform: m.allowed
  };
});
vi.mock("@/src/server/meetings-people", () => ({ producerUserIds: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: m.userFindUnique },
    vaultEntryShare: { findFirst: m.shareFindFirst }
  }
}));

import { getVaultActor } from "@/src/server/password-vault";

beforeEach(() => {
  vi.clearAllMocks();
  const session = { userId: "abby", email: "abby@example.edu" };
  m.real.mockResolvedValue(session);
  m.effective.mockResolvedValue(session);
  m.role.mockResolvedValue(null);
  m.allowed.mockResolvedValue(true);
  m.userFindUnique.mockResolvedValue({ email: "abby@example.edu" });
  m.shareFindFirst.mockResolvedValue({ id: "share-1" });
});

describe("getVaultActor requires a live, allowed account", () => {
  it("keeps shared access for a live account", async () => {
    expect(await getVaultActor()).toEqual({ userId: "abby", access: "shared", canDeleteAny: false, canShare: false });
    expect(m.userFindUnique).toHaveBeenCalledWith({ where: { id: "abby" }, select: { email: true } });
  });

  it("denies a deleted account that still has a share row", async () => {
    m.userFindUnique.mockResolvedValue(null);
    expect(await getVaultActor()).toBeNull();
  });

  it("denies a soft-removed (email blanked) account", async () => {
    m.userFindUnique.mockResolvedValue({ email: null });
    expect(await getVaultActor()).toBeNull();
  });

  it("denies an account that is no longer allowed on the platform", async () => {
    m.allowed.mockResolvedValue(false);
    expect(await getVaultActor()).toBeNull();
  });

  it("denies the full vault too when the account is gone", async () => {
    m.role.mockResolvedValue("EXECUTIVE_PRODUCER");
    m.userFindUnique.mockResolvedValue(null);
    expect(await getVaultActor()).toBeNull();
  });
});
