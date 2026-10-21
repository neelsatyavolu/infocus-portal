import { createHash, randomBytes } from "node:crypto";
import type { Prisma, ShowEditorDevice } from "@prisma/client";
import { mainAppOrigin } from "@/src/lib/hosts";
import { prisma } from "@/src/lib/prisma";
import {
  editorOnline, formatPairingCode, LINK_POLL_INTERVAL_S, LINK_TTL_MS, normalizePairingCode,
  type EditorBackendStatus, type EditorHealth, type ShowEditorDeviceView
} from "@/src/lib/show-editor";
import { hashEditorToken } from "@/src/lib/show-editor-auth";
import { ShowEditError } from "@/src/server/show-editor-errors";
import { randomPairingCode } from "@/src/server/show-editor-pairing";

/**
 * Linking the editing Mac with a device-code flow (like signing a TV in to a streaming service): the setup
 * app shows a code, a producer approves it on The Show, and the Mac collects its token exactly once.
 * Nobody copies a token.
 */

const NOT_FOUND = "That link code isn't valid or has expired. Start again on the Mac.";
const TOKEN_PREFIX = "ifed_";

function hashDeviceCode(deviceCode: string) {
  return createHash("sha256").update(deviceCode).digest("hex");
}

export async function startEditorLink(input: { deviceName: string }, now = new Date()) {
  await prisma.showEditorLink.deleteMany({ where: { expiresAt: { lt: now } } });
  const deviceCode = randomBytes(32).toString("base64url");
  const userCode = randomPairingCode();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
  await prisma.showEditorLink.create({
    data: { deviceCodeHash: hashDeviceCode(deviceCode), userCode, deviceName: input.deviceName.trim() || "Editing Mac", expiresAt }
  });
  const shown = formatPairingCode(userCode);
  return {
    deviceCode,
    userCode: shown,
    verificationUrl: `${mainAppOrigin().replace(/\/$/, "")}/show-roles?link=${shown}`,
    expiresAt: expiresAt.toISOString(),
    interval: LINK_POLL_INTERVAL_S
  };
}

export type LinkPoll = { status: "pending" | "expired" | "denied" } | { status: "approved"; token: string };

/** The Mac's poll. An approved link hands over its token once, then the row is gone. */
export async function pollEditorLink(input: { deviceCode: string }, now = new Date()): Promise<LinkPoll> {
  const link = await prisma.showEditorLink.findUnique({ where: { deviceCodeHash: hashDeviceCode(input.deviceCode) } });
  if (!link) return { status: "expired" };
  if (link.token) {
    // Whoever deletes the row gets the token, so it's returned exactly once.
    const taken = await prisma.showEditorLink.deleteMany({ where: { id: link.id, token: { not: null } } });
    return taken.count > 0 ? { status: "approved", token: link.token } : { status: "expired" };
  }
  if (link.deniedAt) {
    await prisma.showEditorLink.deleteMany({ where: { id: link.id } });
    return { status: "denied" };
  }
  if (link.expiresAt.getTime() <= now.getTime()) {
    await prisma.showEditorLink.deleteMany({ where: { id: link.id } });
    return { status: "expired" };
  }
  return { status: "pending" };
}

async function waitingLink(userCode: string, now: Date) {
  const code = normalizePairingCode(userCode);
  const link = code ? await prisma.showEditorLink.findUnique({ where: { userCode: code } }) : null;
  if (!link || link.token || link.deniedAt || link.approvedById || link.expiresAt.getTime() <= now.getTime()) return null;
  return link;
}

/** For the confirm screen (`/show-roles?link=CODE`): which Mac is asking. */
export async function describeEditorLink(userCode: string, now = new Date()) {
  const link = await waitingLink(userCode, now);
  return link ? { userCode: formatPairingCode(link.userCode), deviceName: link.deviceName, expiresAt: link.expiresAt.toISOString() } : null;
}

/**
 * A producer approves (or turns down) a waiting machine. Other linked machines stay linked; the new one
 * becomes the active editor when `activate` is on (the default) or when no machine is active yet.
 */
export async function decideEditorLink(
  input: { userId: string; userCode: string; approve: boolean; activate?: boolean }, now = new Date()
) {
  const link = await waitingLink(input.userCode, now);
  if (!link) throw new ShowEditError(NOT_FOUND, 404);
  if (!input.approve) {
    await prisma.showEditorLink.update({ where: { id: link.id }, data: { deniedAt: now } });
    return { linked: false as const };
  }
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const hasActive = (await prisma.showEditorDevice.count({ where: { active: true, revokedAt: null } })) > 0;
  const activate = input.activate !== false || !hasActive;
  const deviceId = randomBytes(12).toString("hex");
  await prisma.$transaction([
    // Exactly one active machine: switch the old one off in the same transaction.
    ...(activate ? [prisma.showEditorDevice.updateMany({ where: { active: true }, data: { active: false } })] : []),
    prisma.showEditorDevice.create({
      data: { id: deviceId, name: link.deviceName, tokenHash: hashEditorToken(token), linkedById: input.userId, linkedAt: now, active: activate }
    }),
    // The machine collects the token on its next poll; give it a fresh window to do so.
    prisma.showEditorLink.update({ where: { id: link.id }, data: { approvedById: input.userId, token, expiresAt: new Date(now.getTime() + LINK_TTL_MS) } })
  ]);
  const device = { id: deviceId };
  return { linked: true as const, deviceId: device.id, deviceName: link.deviceName, active: activate };
}

async function requireLinkedDevice(deviceId: string) {
  const device = await prisma.showEditorDevice.findFirst({ where: { id: deviceId, revokedAt: null } });
  if (!device) throw new ShowEditError("That machine isn't linked any more.", 404);
  return device;
}

/** Exactly one active machine: every other one is switched off in the same transaction. */
export async function activateEditorDevice(deviceId: string) {
  await requireLinkedDevice(deviceId);
  await prisma.$transaction([
    prisma.showEditorDevice.updateMany({ where: { active: true, id: { not: deviceId } }, data: { active: false } }),
    prisma.showEditorDevice.update({ where: { id: deviceId }, data: { active: true } })
  ]);
  return { active: deviceId };
}

/** The machine's next heartbeat gets 401, and it shows "Not linked". */
export async function revokeEditorDevice(deviceId: string, now = new Date()) {
  await requireLinkedDevice(deviceId);
  await prisma.showEditorDevice.update({ where: { id: deviceId }, data: { revokedAt: now, active: false } });
  return { revoked: deviceId };
}

function healthOf(value: Prisma.JsonValue | null): EditorHealth | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as EditorHealth) : null;
}

export function editorDeviceView(device: ShowEditorDevice, now = new Date()): ShowEditorDeviceView {
  return {
    id: device.id,
    name: device.name,
    kind: device.kind === "personal" ? "personal" : "dedicated",
    active: device.active,
    online: editorOnline(device.lastSeenAt, now),
    linkedAt: device.linkedAt.toISOString(),
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    version: device.version,
    busy: device.busy,
    health: healthOf(device.health),
    backends: Array.isArray(device.backends) ? (device.backends as unknown as EditorBackendStatus[]) : []
  };
}

/** Every linked machine, active first, then most recently seen. */
export async function listEditorDevices(now = new Date()): Promise<ShowEditorDeviceView[]> {
  const devices = await prisma.showEditorDevice.findMany({
    where: { revokedAt: null }, orderBy: [{ active: "desc" }, { lastSeenAt: { sort: "desc", nulls: "last" } }]
  });
  return devices.map((device) => editorDeviceView(device, now));
}
