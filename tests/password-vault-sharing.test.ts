import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformRole } from "@prisma/client";

const m = vi.hoisted(() => ({
  key: Buffer.alloc(32, 7).toString("base64"),
  real: vi.fn(),
  effective: vi.fn(),
  role: vi.fn(),
  producers: vi.fn(),
  shareFindFirst: vi.fn(),
  shareFindMany: vi.fn(),
  shareDeleteMany: vi.fn(),
  shareCreateMany: vi.fn(),
  entryFindMany: vi.fn(),
  entryFindFirst: vi.fn(),
  entryFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  logCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/src/lib/env", () => ({ env: { PASSWORD_VAULT_KEY: m.key } }));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: m.real, getSessionUser: m.effective }));
vi.mock("@/src/lib/platform-admin", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/platform-admin")>("@/src/lib/platform-admin");
  return { hasPlatformRole: actual.hasPlatformRole, getPlatformRoleForEmail: m.role };
});
vi.mock("@/src/server/meetings-people", () => ({ producerUserIds: m.producers }));
vi.mock("@/src/lib/rate-limit", () => ({ getRequestKey: () => "key", limitByKey: () => ({ allowed: true }) }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    vaultEntryShare: {
      findFirst: m.shareFindFirst,
      findMany: m.shareFindMany,
      deleteMany: m.shareDeleteMany,
      createMany: m.shareCreateMany
    },
    vaultEntry: { findMany: m.entryFindMany, findFirst: m.entryFindFirst, findUnique: m.entryFindUnique },
    vaultAccessLog: { create: m.logCreate },
    user: { findMany: m.userFindMany },
    $transaction: m.transaction
  }
}));

import { PUT as putShares } from "@/app/api/vault/[entryId]/shares/route";
import { PATCH } from "@/app/api/vault/[entryId]/route";
import { POST as reveal } from "@/app/api/vault/[entryId]/reveal/route";
import { encryptVaultField } from "@/src/lib/vault-crypto";
import {
  getVaultActor,
  listVaultEntries,
  listVaultShareCandidates,
  revealVaultField,
  setVaultEntryShares,
  type VaultActor
} from "@/src/server/password-vault";

const ROLES: Record<string, PlatformRole | null> = {
  "exec@example.edu": "EXECUTIVE_PRODUCER",
  "ap@example.edu": "ASSOCIATE_PRODUCER",
  "abby@example.edu": null,
  "otto@example.edu": null
};

function signIn(email: string, viewAs?: string) {
  const id = email.split("@")[0];
  m.real.mockResolvedValue({ userId: id, email });
  m.effective.mockResolvedValue(viewAs ? { userId: viewAs.split("@")[0], email: viewAs } : { userId: id, email });
}

const exec: VaultActor = { userId: "exec", access: "full", canDeleteAny: true, canShare: true };
const ap: VaultActor = { userId: "ap", access: "full", canDeleteAny: false, canShare: false };
const abby: VaultActor = { userId: "abby", access: "shared", canDeleteAny: false, canShare: false };

function vaultRow(id: string) {
  const key = Buffer.from(m.key, "base64");
  return {
    id,
    name: "Instagram",
    url: "https://instagram.com/",
    usernameCipher: encryptVaultField("infocus", key, id, "username"),
    passwordCipher: encryptVaultField("hunter2", key, id, "password"),
    totpCipher: null,
    notesCipher: encryptVaultField("recovery codes", key, id, "notes"),
    createdById: "exec",
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { shares: 2 }
  };
}

function json(method: string, body: unknown) {
  return new Request("https://infocuspaly.com/api/vault/e1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const params = { params: Promise.resolve({ entryId: "e1" }) };

beforeEach(() => {
  vi.resetAllMocks();
  m.role.mockImplementation(async (email: string) => ROLES[email] ?? null);
  m.producers.mockResolvedValue(["exec", "ap"]);
  m.shareFindFirst.mockResolvedValue(null);
  m.shareFindMany.mockResolvedValue([]);
  m.userFindMany.mockResolvedValue([
    { id: "exec", name: "Exec", nickname: null, email: "exec@example.edu" },
    { id: "ap", name: "Sage", nickname: null, email: "ap@example.edu" },
    { id: "abby", name: "Abby", nickname: null, email: "abby@example.edu" },
    { id: "otto", name: "Otto", nickname: null, email: "otto@example.edu" }
  ]);
  m.transaction.mockResolvedValue([]);
});

describe("getVaultActor", () => {
  it("gives execs the full vault with sharing", async () => {
    signIn("exec@example.edu");
    expect(await getVaultActor()).toEqual(exec);
  });

  it("gives associate producers the full vault without sharing", async () => {
    signIn("ap@example.edu");
    expect(await getVaultActor()).toEqual(ap);
  });

  it("gives a student with a shared login shared access", async () => {
    signIn("abby@example.edu");
    m.shareFindFirst.mockResolvedValue({ id: "s1" });
    expect(await getVaultActor()).toEqual(abby);
    expect(m.shareFindFirst).toHaveBeenCalledWith({ where: { userId: "abby" }, select: { id: true } });
  });

  it("denies a student with nothing shared", async () => {
    signIn("otto@example.edu");
    expect(await getVaultActor()).toBeNull();
  });

  it("denies View as a student, even one with shared logins", async () => {
    signIn("exec@example.edu", "abby@example.edu");
    m.shareFindFirst.mockResolvedValue({ id: "s1" });
    expect(await getVaultActor()).toBeNull();
  });
});

describe("listVaultEntries", () => {
  it("only lists logins shared with a shared viewer, without notes or edit", async () => {
    m.entryFindMany.mockResolvedValue([vaultRow("e1")]);
    const [entry] = await listVaultEntries(abby);
    expect(m.entryFindMany.mock.calls[0][0].where).toEqual({ shares: { some: { userId: "abby" } } });
    expect(entry).toMatchObject({ username: "infocus", hasNotes: false, canEdit: false, canDelete: false, canShare: false, sharedWith: 0 });
  });

  it("lists everything for producers with the share count", async () => {
    m.entryFindMany.mockResolvedValue([vaultRow("e1")]);
    const [entry] = await listVaultEntries(exec);
    expect(m.entryFindMany.mock.calls[0][0].where).toBeUndefined();
    expect(entry).toMatchObject({ hasNotes: true, canEdit: true, canDelete: true, canShare: true, sharedWith: 2 });
  });
});

describe("revealVaultField", () => {
  it("reveals a shared password and logs it", async () => {
    m.entryFindFirst.mockResolvedValue(vaultRow("e1"));
    expect(await revealVaultField(abby, "e1", "password")).toEqual({ field: "password", value: "hunter2" });
    expect(m.entryFindFirst).toHaveBeenCalledWith({ where: { id: "e1", shares: { some: { userId: "abby" } } } });
    expect(m.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "abby", action: "REVEAL_PASSWORD" }) });
  });

  it("hides logins that weren't shared", async () => {
    m.entryFindFirst.mockResolvedValue(null);
    await expect(revealVaultField(abby, "e2", "password")).rejects.toThrow("NOT_FOUND");
  });

  it("never reveals notes to a shared viewer", async () => {
    await expect(revealVaultField(abby, "e1", "notes")).rejects.toThrow("FORBIDDEN");
    expect(m.entryFindFirst).not.toHaveBeenCalled();
  });
});

describe("sharing", () => {
  it("offers everyone outside the vault", async () => {
    expect(await listVaultShareCandidates()).toEqual([
      { id: "abby", name: "Abby" },
      { id: "otto", name: "Otto" }
    ]);
  });

  it("adds and removes people in one change and logs it", async () => {
    m.entryFindUnique.mockResolvedValue(vaultRow("e1"));
    m.shareFindMany.mockResolvedValueOnce([{ userId: "otto" }]).mockResolvedValue([{ userId: "abby" }]);
    await setVaultEntryShares(exec, "e1", ["abby"]);
    expect(m.shareDeleteMany).toHaveBeenCalledWith({ where: { entryId: "e1", userId: { in: ["otto"] } } });
    expect(m.shareCreateMany).toHaveBeenCalledWith({
      data: [{ entryId: "e1", userId: "abby", sharedById: "exec" }],
      skipDuplicates: true
    });
    expect(m.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "exec", action: "SHARE" }) });
    expect(m.transaction).toHaveBeenCalledTimes(1);
  });

  it("refuses to share with a producer", async () => {
    m.entryFindUnique.mockResolvedValue(vaultRow("e1"));
    await expect(setVaultEntryShares(exec, "e1", ["ap"])).rejects.toThrow("outside the vault");
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("refuses associate producers", async () => {
    await expect(setVaultEntryShares(ap, "e1", ["abby"])).rejects.toThrow("FORBIDDEN");
  });
});

describe("routes", () => {
  it("blocks associate producers from changing shares", async () => {
    signIn("ap@example.edu");
    expect((await putShares(json("PUT", { userIds: ["abby"] }), params)).status).toBe(403);
  });

  it("lets execs change shares", async () => {
    signIn("exec@example.edu");
    m.entryFindUnique.mockResolvedValue(vaultRow("e1"));
    expect((await putShares(json("PUT", { userIds: ["abby"] }), params)).status).toBe(200);
  });

  it("blocks shared viewers from editing", async () => {
    signIn("abby@example.edu");
    m.shareFindFirst.mockResolvedValue({ id: "s1" });
    expect((await PATCH(json("PATCH", { password: "new" }), params)).status).toBe(403);
  });

  it("lets shared viewers reveal a shared password", async () => {
    signIn("abby@example.edu");
    m.shareFindFirst.mockResolvedValue({ id: "s1" });
    m.entryFindFirst.mockResolvedValue(vaultRow("e1"));
    expect((await reveal(json("POST", { field: "password" }), params)).status).toBe(200);
  });
});
