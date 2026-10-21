import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/src/lib/prisma";
import { LEGACY_EDITOR_DEVICE_ID } from "@/src/lib/show-editor";

const BEARER = /^Bearer (\S{16,512})$/;

export function hashEditorToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function matchesLegacySecret(header: string, secret: string | undefined) {
  if (!secret) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Which editing machine is calling /api/service/show-editor/*: a linked machine (`Bearer <device token>`,
 * matched by sha256 against an unrevoked ShowEditorDevice) or the legacy `SHOW_EDITOR_TOKEN` Worker secret,
 * which counts as the machine "legacy". Null when neither matches (or that machine was unlinked).
 * Machines never hold CRON_SECRET or the Drive service token.
 */
export async function editorCaller(
  request: Request, secret = process.env.SHOW_EDITOR_TOKEN?.trim()
): Promise<{ deviceId: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  if (matchesLegacySecret(header, secret)) {
    const legacy = await prisma.showEditorDevice.upsert({
      where: { id: LEGACY_EDITOR_DEVICE_ID },
      update: {},
      create: { id: LEGACY_EDITOR_DEVICE_ID, name: "legacy", linkedById: "env" },
      select: { id: true, revokedAt: true }
    });
    return legacy.revokedAt ? null : { deviceId: legacy.id };
  }
  const token = BEARER.exec(header)?.[1];
  if (!token) return null;
  const device = await prisma.showEditorDevice.findFirst({
    where: { tokenHash: hashEditorToken(token), revokedAt: null }, select: { id: true }
  });
  return device ? { deviceId: device.id } : null;
}

export async function isShowEditorRequest(request: Request, secret = process.env.SHOW_EDITOR_TOKEN?.trim()) {
  return (await editorCaller(request, secret)) !== null;
}
