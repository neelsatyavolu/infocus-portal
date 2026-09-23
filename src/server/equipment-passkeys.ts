import { createHash, randomUUID } from "node:crypto";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON
} from "@simplewebauthn/server";
import { prisma } from "@/src/lib/prisma";
import { getPlatformAccess, isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";
import { requireEquipmentManagerAccess } from "@/src/server/equipment-access";

type Purpose = "register" | "login" | "unlock";
type Context = { origin: string; rpID: string };

export function passkeyContext(request: Request): Context {
  const url = new URL(request.url);
  const productionOrigins = ["https://equipment.infocuspaly.com", "https://infocuspaly.com", "https://www.infocuspaly.com"];
  const local = process.env.NODE_ENV !== "production" && url.hostname === "localhost";
  if ((!productionOrigins.includes(url.origin) && !local) || request.headers.get("origin") !== url.origin) {
    throw new Error("FORBIDDEN");
  }
  return { origin: url.origin, rpID: local ? "localhost" : "infocuspaly.com" };
}

export async function requirePasskeyManager(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await isEmailAllowedToUsePlatform(user.email))) throw new Error("FORBIDDEN");
  const access = await getPlatformAccess(user.email);
  await requireEquipmentManagerAccess(user.id, access.role);
  return user;
}

function userHandle(userId: string) {
  return createHash("sha256").update("equipment-passkey:" + userId).digest();
}

async function saveChallenge(challenge: string, purpose: Purpose, origin: string, userId?: string) {
  await prisma.equipmentPasskeyChallenge.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const id = randomUUID();
  await prisma.equipmentPasskeyChallenge.create({ data: {
    id, challenge, purpose, origin, userId, expiresAt: new Date(Date.now() + 5 * 60_000)
  } });
  return id;
}

export async function consumePasskeyChallenge(id: string, purpose: Purpose, origin: string, userId?: string) {
  const challenge = await prisma.equipmentPasskeyChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.purpose !== purpose || challenge.origin !== origin ||
      challenge.expiresAt <= new Date() || (challenge.userId ?? undefined) !== userId) {
    throw new Error("UNAUTHORIZED");
  }
  const consumed = await prisma.equipmentPasskeyChallenge.deleteMany({ where: { id, expiresAt: { gt: new Date() } } });
  if (consumed.count !== 1) throw new Error("UNAUTHORIZED");
  return challenge.challenge;
}

export async function registrationOptions(userId: string, context: Context) {
  const user = await requirePasskeyManager(userId);
  const existing = await prisma.equipmentPasskey.findMany({ where: { userId }, select: { id: true } });
  const options = await generateRegistrationOptions({
    rpName: "InFocus Portal Equipment", rpID: context.rpID,
    userID: new Uint8Array(userHandle(userId)), userName: user.email || user.id,
    userDisplayName: user.name || user.email || user.id,
    attestationType: "none", excludeCredentials: existing.map(({ id }) => ({ id })),
    authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" }
  });
  return { options, challengeId: await saveChallenge(options.challenge, "register", context.origin, userId) };
}

export async function registerEquipmentPasskey(userId: string, id: string, context: Context, response: RegistrationResponseJSON, label: string) {
  await requirePasskeyManager(userId);
  const challenge = await consumePasskeyChallenge(id, "register", context.origin, userId);
  const verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge,
    expectedOrigin: context.origin, expectedRPID: context.rpID, requireUserVerification: true });
  if (!verification.verified || !verification.registrationInfo) throw new Error("UNAUTHORIZED");
  const { credential } = verification.registrationInfo;
  await prisma.equipmentPasskey.create({ data: {
    id: credential.id, userId, publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter), label
  } });
}

export async function authenticationOptions(purpose: "login" | "unlock", context: Context) {
  const options = await generateAuthenticationOptions({ rpID: context.rpID, userVerification: "required" });
  return { options, challengeId: await saveChallenge(options.challenge, purpose, context.origin) };
}

export async function authenticateEquipmentPasskey(id: string, purpose: "login" | "unlock", context: Context, response: AuthenticationResponseJSON) {
  const challenge = await consumePasskeyChallenge(id, purpose, context.origin);
  const credential = await prisma.equipmentPasskey.findUnique({ where: { id: response.id }, include: { user: true } });
  if (!credential) throw new Error("UNAUTHORIZED");
  const user = credential.user;
  if (!(await isEmailAllowedToUsePlatform(user.email))) throw new Error("FORBIDDEN");
  const access = await getPlatformAccess(user.email);
  await requireEquipmentManagerAccess(user.id, access.role);
  if (response.response.userHandle && response.response.userHandle !== userHandle(user.id).toString("base64url")) {
    throw new Error("UNAUTHORIZED");
  }
  const verification = await verifyAuthenticationResponse({ response,
    expectedChallenge: challenge, expectedOrigin: context.origin, expectedRPID: context.rpID,
    requireUserVerification: true,
    credential: { id: credential.id, publicKey: new Uint8Array(credential.publicKey), counter: Number(credential.counter) }
  });
  if (!verification.verified) throw new Error("UNAUTHORIZED");
  const updated = await prisma.equipmentPasskey.updateMany({
    where: { id: credential.id, counter: credential.counter },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() }
  });
  if (updated.count !== 1) throw new Error("UNAUTHORIZED");
  return user;
}
