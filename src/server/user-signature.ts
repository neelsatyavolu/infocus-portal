import { getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { getPlatformAccess, isEmailAllowedToUsePlatform, isExecutiveProducer } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { CERTIFICATE_SIGNER_COUNT, parseSignatureImage, type CertificateSigner } from "@/src/lib/signature-image";
import { loadAssignableExecutiveProducers, loadExecutiveProducerRoleUsers } from "@/src/server/package-progress-data";

/**
 * Settings → Signature is for executive producers and the super admin, as themselves:
 * View as never counts, so nobody draws a signature for someone else.
 */
export async function requireSignatureOwner() {
  const [real, session] = await Promise.all([getRealSessionUser(), getSessionUser()]);
  if (!real?.userId) throw new Error("UNAUTHORIZED");
  if (session?.userId !== real.userId) throw new Error("FORBIDDEN");
  if (!(await isEmailAllowedToUsePlatform(real.email))) throw new Error("FORBIDDEN");
  if (!isExecutiveProducer((await getPlatformAccess(real.email)).role)) throw new Error("FORBIDDEN");
  return real.userId;
}

export async function loadSignature(userId: string) {
  const row = await prisma.userSignature.findUnique({ where: { userId }, select: { imageData: true } });
  return row?.imageData ?? null;
}

export async function saveSignature(userId: string, imageData: string) {
  if (!parseSignatureImage(imageData)) {
    throw new Error("That signature couldn't be saved. Clear it and draw it again.");
  }
  await prisma.userSignature.upsert({
    where: { userId },
    create: { userId, imageData },
    update: { imageData }
  });
  return imageData;
}

export async function deleteSignature(userId: string) {
  await prisma.userSignature.deleteMany({ where: { userId } });
}

/**
 * Three executive producers in name order, with full names and any signature they drew. People with the
 * executive producer role come first; the super admin only fills a line no executive producer takes.
 */
export async function loadCertificateSigners(): Promise<CertificateSigner[]> {
  const [roleHolders, everyone] = await Promise.all([
    loadExecutiveProducerRoleUsers(),
    loadAssignableExecutiveProducers()
  ]);
  const roleIds = new Set(roleHolders.map((executive) => executive.userId));
  const chosenIds = new Set(
    [...everyone.filter((executive) => roleIds.has(executive.userId)), ...everyone.filter((executive) => !roleIds.has(executive.userId))]
      .slice(0, CERTIFICATE_SIGNER_COUNT)
      .map((executive) => executive.userId)
  );
  const executives = everyone.filter((executive) => chosenIds.has(executive.userId));
  const users = await prisma.user.findMany({
    where: { id: { in: executives.map((executive) => executive.userId) } },
    select: { id: true, name: true, signature: { select: { imageData: true } } }
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  return executives.map((executive) => {
    const user = byId.get(executive.userId);
    const imageData = user?.signature?.imageData;
    return {
      name: user?.name?.trim() || executive.name?.trim() || "",
      signature: imageData ? parseSignatureImage(imageData) : null
    };
  });
}
