import { randomUUID } from "node:crypto";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { getPlatformRoleForEmail, hasPlatformRole } from "@/src/lib/platform-admin";
import {
  normalizeVaultUrl,
  type VaultAccess,
  type VaultAction,
  type VaultActivityRow,
  type VaultEntryInput,
  type VaultEntrySummary,
  type VaultEntryUpdate,
  type VaultImportResult,
  type VaultPerson,
  type VaultRevealField
} from "@/src/lib/password-vault";
import { prisma } from "@/src/lib/prisma";
import { producerUserIds } from "@/src/server/meetings-people";
import { generateTotp, parseTotpInput, type TotpConfig } from "@/src/lib/totp";
import { userDisplayName } from "@/src/lib/user-display";
import { decryptVaultField, encryptVaultField, parseVaultKey, type VaultField } from "@/src/lib/vault-crypto";

export type VaultActor = {
  userId: string;
  access: VaultAccess;
  canDeleteAny: boolean;
  /** Executive producers, advisers, and super admins can share a login with people outside the vault. */
  canShare: boolean;
};

export async function hasSharedVaultEntries(userId: string) {
  return Boolean(await prisma.vaultEntryShare.findFirst({ where: { userId }, select: { id: true } }));
}

/**
 * Associate producers and up get the full vault. Both the signed-in account
 * and any View-as target must qualify, and the log records the real account.
 * Anyone else gets only the logins shared with them, and not while viewing as
 * someone else.
 */
export async function getVaultActor(): Promise<VaultActor | null> {
  const [real, effective] = await Promise.all([getRealSessionUser(), getSessionUser()]);
  if (!real?.userId || !effective?.userId) return null;

  const [realRole, effectiveRole] = await Promise.all([
    getPlatformRoleForEmail(real.email),
    getPlatformRoleForEmail(effective.email)
  ]);
  if (hasPlatformRole(realRole, "ASSOCIATE_PRODUCER") && hasPlatformRole(effectiveRole, "ASSOCIATE_PRODUCER")) {
    const isExec = hasPlatformRole(realRole, "EXECUTIVE_PRODUCER");
    return { userId: real.userId, access: "full", canDeleteAny: isExec, canShare: isExec };
  }

  if (real.userId === effective.userId && (await hasSharedVaultEntries(real.userId))) {
    return { userId: real.userId, access: "shared", canDeleteAny: false, canShare: false };
  }
  return null;
}

export async function requireVaultActor() {
  const real = await getRealSessionUser();
  if (!real?.userId) throw new Error("UNAUTHORIZED");
  const actor = await getVaultActor();
  if (!actor) throw new Error("FORBIDDEN");
  return actor;
}

/** Add, edit, delete, import, and activity: associate producers and up only. */
export async function requireFullVaultActor() {
  const actor = await requireVaultActor();
  if (actor.access !== "full") throw new Error("FORBIDDEN");
  return actor;
}

export async function requireVaultSharer() {
  const actor = await requireVaultActor();
  if (!actor.canShare) throw new Error("FORBIDDEN");
  return actor;
}

/**
 * JSON-only writes force a CORS preflight, so another subdomain sharing the
 * session cookie cannot drive the vault with a plain form post.
 */
export function assertJsonRequest(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("BAD_REQUEST");
  }
}

function vaultKey() {
  const key = parseVaultKey(env.PASSWORD_VAULT_KEY);
  if (!key) throw new Error("Password vault is not configured.");
  return key;
}

function encryptOptional(value: string | undefined, key: Buffer, entryId: string, field: VaultField) {
  if (value === undefined) return undefined;
  return value ? encryptVaultField(value, key, entryId, field) : null;
}

function prepareUrl(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const url = normalizeVaultUrl(raw);
  if (url === undefined) throw new Error("Website must be an http or https link.");
  return url;
}

function prepareTotp(raw: string | undefined, key: Buffer, entryId: string) {
  if (raw === undefined) return undefined;
  if (!raw.trim()) return null;
  const config = parseTotpInput(raw);
  if (!config) throw new Error("2FA setup key must be a base32 key or an otpauth:// link.");
  return encryptVaultField(JSON.stringify(config), key, entryId, "totp");
}

async function logVaultAction(entry: { id: string; name: string }, userId: string, action: VaultAction) {
  await prisma.vaultAccessLog.create({
    data: { entryId: entry.id, entryName: entry.name, userId, action }
  });
}

async function displayNames(userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, nickname: true, email: true }
  });
  return new Map(users.map((user) => [user.id, userDisplayName(user) || user.email || "Unknown"]));
}

export async function listVaultEntries(actor: VaultActor): Promise<VaultEntrySummary[]> {
  const key = vaultKey();
  const shared = actor.access === "shared";
  const entries = await prisma.vaultEntry.findMany({
    where: shared ? { shares: { some: { userId: actor.userId } } } : undefined,
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { shares: true } } }
  });
  const names = await displayNames(entries.map((entry) => entry.updatedById));

  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    url: entry.url,
    username: entry.usernameCipher ? decryptVaultField(entry.usernameCipher, key, entry.id, "username") : null,
    hasPassword: Boolean(entry.passwordCipher),
    hasTotp: Boolean(entry.totpCipher),
    hasNotes: !shared && Boolean(entry.notesCipher),
    updatedAt: entry.updatedAt.toISOString(),
    updatedBy: entry.updatedById ? (names.get(entry.updatedById) ?? null) : null,
    canDelete: !shared && (actor.canDeleteAny || entry.createdById === actor.userId),
    canEdit: !shared,
    canShare: actor.canShare,
    sharedWith: shared ? 0 : entry._count.shares
  }));
}

function newEntryData(actor: VaultActor, input: VaultEntryInput, key: Buffer) {
  const id = randomUUID();
  return {
    id,
    name: input.name,
    url: prepareUrl(input.url) ?? null,
    usernameCipher: encryptOptional(input.username?.trim(), key, id, "username") ?? null,
    passwordCipher: encryptOptional(input.password, key, id, "password") ?? null,
    totpCipher: prepareTotp(input.totp, key, id) ?? null,
    notesCipher: encryptOptional(input.notes?.trim(), key, id, "notes") ?? null,
    createdById: actor.userId,
    updatedById: actor.userId
  };
}

export async function createVaultEntry(actor: VaultActor, input: VaultEntryInput) {
  const entry = await prisma.vaultEntry.create({
    data: newEntryData(actor, input, vaultKey()),
    select: { id: true, name: true }
  });
  await logVaultAction(entry, actor.userId, "CREATE");
  return entry;
}

/**
 * Bulk import (1Password). An unusable website or 2FA key is dropped from
 * that one item and reported, instead of failing the whole import.
 */
export async function importVaultEntries(actor: VaultActor, inputs: VaultEntryInput[]): Promise<VaultImportResult> {
  const key = vaultKey();
  const warnings: string[] = [];
  const rows = inputs.map((input) => {
    const cleaned = {
      ...input,
      url: normalizeVaultUrl(input.url) === undefined ? undefined : input.url,
      totp: input.totp?.trim() && !parseTotpInput(input.totp) ? undefined : input.totp
    };
    if (cleaned.url !== input.url) warnings.push(`${input.name}: website skipped (not an http/https link).`);
    if (cleaned.totp !== input.totp) warnings.push(`${input.name}: 2FA skipped (unsupported key).`);
    return newEntryData(actor, cleaned, key);
  });

  await prisma.$transaction([
    prisma.vaultEntry.createMany({ data: rows }),
    prisma.vaultAccessLog.createMany({
      data: rows.map((row) => ({ entryId: row.id, entryName: row.name, userId: actor.userId, action: "IMPORT" }))
    })
  ]);

  return { imported: rows.length, warnings };
}

async function findEntry(entryId: string) {
  const entry = await prisma.vaultEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error("NOT_FOUND");
  return entry;
}

export async function updateVaultEntry(actor: VaultActor, entryId: string, input: VaultEntryUpdate) {
  const key = vaultKey();
  const existing = await findEntry(entryId);
  const entry = await prisma.vaultEntry.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      url: prepareUrl(input.url),
      usernameCipher: encryptOptional(input.username?.trim(), key, existing.id, "username"),
      passwordCipher: encryptOptional(input.password, key, existing.id, "password"),
      totpCipher: prepareTotp(input.totp, key, existing.id),
      notesCipher: encryptOptional(input.notes?.trim(), key, existing.id, "notes"),
      updatedById: actor.userId
    },
    select: { id: true, name: true }
  });
  await logVaultAction(entry, actor.userId, "UPDATE");
  return entry;
}

export async function deleteVaultEntry(actor: VaultActor, entryId: string) {
  const existing = await findEntry(entryId);
  if (!actor.canDeleteAny && existing.createdById !== actor.userId) throw new Error("FORBIDDEN");
  await prisma.vaultEntry.delete({ where: { id: existing.id } });
  await logVaultAction(existing, actor.userId, "DELETE");
  return { id: existing.id };
}

function decryptOrThrow(cipher: string | null, key: Buffer, entryId: string, field: VaultField) {
  if (!cipher) throw new Error("NOT_FOUND");
  const value = decryptVaultField(cipher, key, entryId, field);
  if (value === null) throw new Error("This entry could not be decrypted.");
  return value;
}

/** Secrets leave the server one field at a time and every read is logged. */
export async function revealVaultField(actor: VaultActor, entryId: string, field: VaultRevealField) {
  const key = vaultKey();
  const shared = actor.access === "shared";
  if (shared && field === "notes") throw new Error("FORBIDDEN");
  const entry = await prisma.vaultEntry.findFirst({
    where: { id: entryId, ...(shared ? { shares: { some: { userId: actor.userId } } } : {}) }
  });
  if (!entry) throw new Error("NOT_FOUND");

  if (field === "totp") {
    const config = JSON.parse(decryptOrThrow(entry.totpCipher, key, entry.id, "totp")) as TotpConfig;
    await logVaultAction(entry, actor.userId, "VIEW_2FA_CODE");
    return { field, ...generateTotp(config) };
  }

  if (field === "notes") {
    const value = decryptOrThrow(entry.notesCipher, key, entry.id, "notes");
    await logVaultAction(entry, actor.userId, "REVEAL_NOTES");
    return { field, value };
  }

  const value = decryptOrThrow(entry.passwordCipher, key, entry.id, "password");
  await logVaultAction(entry, actor.userId, "REVEAL_PASSWORD");
  return { field, value };
}

export async function listVaultActivity(entryId: string, limit = 25): Promise<VaultActivityRow[]> {
  const rows = await prisma.vaultAccessLog.findMany({
    where: { entryId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  const names = await displayNames(rows.map((row) => row.userId));
  return rows.map((row) => ({
    id: row.id,
    action: row.action as VaultAction,
    actor: names.get(row.userId) ?? "Unknown",
    createdAt: row.createdAt.toISOString()
  }));
}

function byName(a: VaultPerson, b: VaultPerson) {
  return a.name.localeCompare(b.name);
}

/** Everyone with a Portal account who isn't already in the vault (producers see every login anyway). */
export async function listVaultShareCandidates(): Promise<VaultPerson[]> {
  const [users, producers] = await Promise.all([
    prisma.user.findMany({ where: { email: { not: null } }, select: { id: true, name: true, nickname: true, email: true } }),
    producerUserIds()
  ]);
  const inVault = new Set(producers);
  return users
    .filter((user) => !inVault.has(user.id) && !isAppReviewEmail(user.email))
    .map((user) => ({ id: user.id, name: userDisplayName(user) || user.email || "Unknown" }))
    .sort(byName);
}

export async function listVaultEntryShares(entryId: string): Promise<VaultPerson[]> {
  const entry = await findEntry(entryId);
  const shares = await prisma.vaultEntryShare.findMany({ where: { entryId: entry.id }, select: { userId: true } });
  const names = await displayNames(shares.map((share) => share.userId));
  return shares.map((share) => ({ id: share.userId, name: names.get(share.userId) ?? "Unknown" })).sort(byName);
}

/**
 * Replaces who a login is shared with. New people must be Portal members
 * outside the vault; people already on the list can stay.
 */
export async function setVaultEntryShares(actor: VaultActor, entryId: string, userIds: string[]) {
  if (!actor.canShare) throw new Error("FORBIDDEN");
  const entry = await findEntry(entryId);
  const wanted = [...new Set(userIds)];
  const [current, candidates] = await Promise.all([
    prisma.vaultEntryShare.findMany({ where: { entryId: entry.id }, select: { userId: true } }),
    listVaultShareCandidates()
  ]);
  const currentIds = new Set(current.map((share) => share.userId));
  const allowed = new Set(candidates.map((person) => person.id));
  if (wanted.some((id) => !currentIds.has(id) && !allowed.has(id))) {
    throw new Error("Logins can only be shared with Portal members outside the vault.");
  }

  const added = wanted.filter((id) => !currentIds.has(id));
  const removed = [...currentIds].filter((id) => !wanted.includes(id));
  if (added.length || removed.length) {
    await prisma.$transaction([
      prisma.vaultEntryShare.deleteMany({ where: { entryId: entry.id, userId: { in: removed } } }),
      prisma.vaultEntryShare.createMany({
        data: added.map((userId) => ({ entryId: entry.id, userId, sharedById: actor.userId })),
        skipDuplicates: true
      }),
      prisma.vaultAccessLog.create({
        data: { entryId: entry.id, entryName: entry.name, userId: actor.userId, action: "SHARE" }
      })
    ]);
  }
  return listVaultEntryShares(entry.id);
}
