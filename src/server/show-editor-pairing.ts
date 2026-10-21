import { createHash, randomInt } from "node:crypto";
import { mainAppOrigin } from "@/src/lib/hosts";
import { prisma } from "@/src/lib/prisma";
import {
  formatPairingCode, normalizePairingCode, PAIRING_CIPHERTEXT_MAX, PAIRING_CIPHERTEXT_TTL_MS, PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH, PAIRING_TTL_MS, SHOW_EDIT_BACKENDS, type PairingStatus, type ShowEditBackend
} from "@/src/lib/show-editor";
import { ShowEditError } from "@/src/server/show-editor-errors";
import { editorRateLimited } from "@/src/server/show-editor-rate-limit";

/**
 * "Connect AI account": a producer's computer signs in to a subscription, seals the credential to the
 * editing Mac's X25519 key, and posts the ciphertext with a one-time code. The Portal never sees the
 * credential; it hands the ciphertext to the Mac on its next heartbeat and drops it once acknowledged.
 */

const DEFAULT_REPO_URL = "https://github.com/neelsatyavolu/infocus-editor";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const NOT_FOUND = "That code isn't valid. It may have expired or been used; make a new one in the Portal.";

export function hashPairingCode(input: string) {
  const code = normalizePairingCode(input);
  return code ? createHash("sha256").update(code).digest("hex") : null;
}

export function randomPairingCode() {
  return Array.from({ length: PAIRING_CODE_LENGTH }, () => PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)]).join("");
}

export function pairingCommand(backend: ShowEditBackend, code: string) {
  const repo = (process.env.SHOW_EDITOR_REPO_URL?.trim() || DEFAULT_REPO_URL).replace(/\/$/, "");
  return `uvx --from git+${repo} infocus-editor connect ${backend} --code ${code} --portal ${mainAppOrigin().replace(/\/$/, "")}`;
}

/** A code for one machine (default: the active one), bound to that machine's current public key. */
export async function createPairing(input: { userId: string; backend: ShowEditBackend; deviceId?: string }, now = new Date()) {
  const device = await prisma.showEditorDevice.findFirst({
    where: input.deviceId ? { id: input.deviceId, revokedAt: null } : { active: true, revokedAt: null }
  });
  if (!device) throw new ShowEditError(input.deviceId ? "That machine isn't linked any more." : "Link an editing machine first.", 404);
  if (!device.publicKey) {
    throw new ShowEditError(`${device.name} hasn't checked in yet. Start the editor on it, then try again.`, 409);
  }
  const code = randomPairingCode();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  await prisma.showEditorPairing.create({
    data: { codeHash: hashPairingCode(code)!, backend: input.backend, deviceId: device.id, publicKey: device.publicKey, createdById: input.userId, expiresAt }
  });
  const shown = formatPairingCode(code);
  return { code: shown, expiresAt: expiresAt.toISOString(), command: pairingCommand(input.backend, shown), deviceId: device.id };
}

/** GET pair/<code>: what the producer's computer needs to seal the sign-in. */
export async function lookupPairing(code: string, now = new Date()) {
  const codeHash = hashPairingCode(code);
  const pairing = codeHash ? await prisma.showEditorPairing.findUnique({ where: { codeHash } }) : null;
  if (!pairing || pairing.submittedAt || pairing.expiresAt.getTime() <= now.getTime()) throw new ShowEditError(NOT_FOUND, 404);
  return { backend: pairing.backend as ShowEditBackend, publicKey: pairing.publicKey, expiresAt: pairing.expiresAt.toISOString() };
}

/** POST pair/<code>: store the sealed sign-in; the code is spent. */
export async function submitPairing(code: string, ciphertext: string, now = new Date()) {
  if (ciphertext.length === 0 || ciphertext.length > PAIRING_CIPHERTEXT_MAX || !BASE64.test(ciphertext)) {
    throw new ShowEditError(`ciphertext must be base64, at most ${PAIRING_CIPHERTEXT_MAX} characters.`, 400);
  }
  const codeHash = hashPairingCode(code);
  if (!codeHash) throw new ShowEditError(NOT_FOUND, 404);
  const stored = await prisma.showEditorPairing.updateMany({
    where: { codeHash, submittedAt: null, expiresAt: { gt: now } },
    data: { ciphertext, submittedAt: now }
  });
  if (stored.count === 0) throw new ShowEditError(NOT_FOUND, 404);
  return { ok: true as const };
}

/** Heartbeat: sealed sign-ins for this machine's current key that it hasn't acknowledged yet. */
export async function deliverCredentials(deviceId: string, publicKey: string | null | undefined, now = new Date()) {
  if (!publicKey) return [];
  const pending = await prisma.showEditorPairing.findMany({
    where: { deviceId, publicKey, submittedAt: { not: null }, ciphertext: { not: null }, ackOk: null },
    select: { id: true, backend: true, ciphertext: true },
    orderBy: { submittedAt: "asc" },
    take: 10
  });
  if (pending.length > 0) {
    await prisma.showEditorPairing.updateMany({ where: { id: { in: pending.map((row) => row.id) } }, data: { deliveredAt: now } });
  }
  return pending.map((row) => ({ id: row.id, backend: row.backend as ShowEditBackend, ciphertext: row.ciphertext ?? "" }));
}

/** The Mac installed (or couldn't install) a sign-in: keep the result, drop the ciphertext. */
export async function applyCredentialAcks(acks: { id: string; ok: boolean; error?: string }[], deviceId: string) {
  for (const ack of acks) {
    await prisma.showEditorPairing.updateMany({
      where: { id: ack.id, deviceId },
      data: { ackOk: ack.ok, ackError: ack.ok ? null : (ack.error?.trim() || "The editing Mac couldn't use this sign-in."), ciphertext: null }
    });
  }
}

export async function purgeStaleCiphertext(now = new Date()) {
  await prisma.showEditorPairing.updateMany({
    where: { ciphertext: { not: null }, submittedAt: { lt: new Date(now.getTime() - PAIRING_CIPHERTEXT_TTL_MS) } },
    data: { ciphertext: null }
  });
}

type PairingRow = { deviceId: string; backend: string; expiresAt: Date; submittedAt: Date | null; ciphertext: string | null; ackOk: boolean | null; ackError: string | null };

function statusOf(row: PairingRow, now: Date): Pick<PairingStatus, "status" | "error"> {
  if (row.ackOk === true) return { status: "connected", error: null };
  if (row.ackOk === false) return { status: "failed", error: row.ackError };
  if (!row.submittedAt) {
    return row.expiresAt.getTime() > now.getTime()
      ? { status: "waiting", error: null }
      : { status: "failed", error: "The code expired before it was used. Make a new one." };
  }
  return row.ciphertext
    ? { status: "sent", error: null }
    : { status: "failed", error: "The editing Mac didn't install the sign-in within an hour. Make a new code." };
}

/** The latest code per machine and backend, for the panel. */
export async function pairingStatuses(now = new Date()): Promise<PairingStatus[]> {
  const rows: PairingRow[] = await prisma.showEditorPairing.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { deviceId: true, backend: true, expiresAt: true, submittedAt: true, ciphertext: true, ackOk: true, ackError: true }
  });
  const seen = new Set<string>();
  const statuses: PairingStatus[] = [];
  for (const row of rows) {
    const key = `${row.deviceId}:${row.backend}`;
    if (seen.has(key) || !SHOW_EDIT_BACKENDS.includes(row.backend as ShowEditBackend)) continue;
    seen.add(key);
    statuses.push({ deviceId: row.deviceId, backend: row.backend as ShowEditBackend, ...statusOf(row, now), expiresAt: row.expiresAt.toISOString() });
  }
  return statuses;
}

/** Per-address guard for the pair/<code> routes. */
export function pairingRateLimited(ip: string, now = new Date()) {
  return editorRateLimited("pair", ip, now);
}
