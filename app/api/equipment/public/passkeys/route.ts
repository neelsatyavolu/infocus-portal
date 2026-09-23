import { cookies } from "next/headers";
import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { handleRouteError } from "@/src/lib/api-errors";
import { createAppSessionToken, getAppSessionCookieMeta, getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import {
  passkeyContext, requirePasskeyManager, registrationOptions, registerEquipmentPasskey,
  authenticationOptions, authenticateEquipmentPasskey
} from "@/src/server/equipment-passkeys";

const CHALLENGE_COOKIE = "infocus_equipment_passkey_challenge";
const purpose = z.literal("login");
const response = z.object({
  id: z.string().min(1).max(2048), rawId: z.string().min(1).max(2048), type: z.literal("public-key"),
  response: z.object({ clientDataJSON: z.string().min(1).max(16384) }).passthrough(),
  clientExtensionResults: z.record(z.unknown())
}).passthrough();
const registrationResponse = response.extend({ response: response.shape.response.extend({
  attestationObject: z.string().min(1).max(49152)
}) });
const authenticationResponse = response.extend({ response: response.shape.response.extend({
  authenticatorData: z.string().min(1).max(16384), signature: z.string().min(1).max(16384),
  userHandle: z.string().max(2048).optional()
}) });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(2048) }),
  z.object({ action: z.literal("register-options") }),
  z.object({ action: z.literal("register"), response: registrationResponse, label: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("authenticate-options"), purpose }),
  z.object({ action: z.literal("authenticate"), purpose, response: authenticationResponse })
]);

async function registrationUser() {
  const [real, effective] = await Promise.all([getRealSessionUser(), getSessionUser()]);
  if (!real) throw new Error("UNAUTHORIZED");
  if (real.userId !== effective?.userId) throw new Error("Exit View as before managing your passkeys.");
  await requirePasskeyManager(real.userId);
  return real.userId;
}

export async function POST(request: Request) {
  try {
    const context = passkeyContext(request);
    if (!limitByKey(getRequestKey(request, "equipment:passkeys"), { max: 40, windowMs: 60_000 }).allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    const raw = await request.text();
    if (raw.length > 65536) throw new Error("BAD_REQUEST");
    const body = bodySchema.parse(JSON.parse(raw));
    const store = await cookies();
    const challengeMeta = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1", path: "/", maxAge: 300 };
    if (body.action === "list" || body.action === "remove") {
      const userId = await registrationUser();
      if (body.action === "remove") {
        await prisma.equipmentPasskey.deleteMany({ where: { id: body.id, userId } });
        return ok({ removed: true });
      }
      return ok(await prisma.equipmentPasskey.findMany({ where: { userId },
        select: { id: true, label: true, createdAt: true }, orderBy: { createdAt: "asc" } }));
    }
    if (body.action === "register-options") {
      const { options, challengeId } = await registrationOptions(await registrationUser(), context);
      store.set(CHALLENGE_COOKIE, challengeId, challengeMeta);
      return ok(options);
    }
    if (body.action === "authenticate-options") {
      const { options, challengeId } = await authenticationOptions(body.purpose, context);
      store.set(CHALLENGE_COOKIE, challengeId, challengeMeta);
      return ok(options);
    }
    const challengeId = store.get(CHALLENGE_COOKIE)?.value;
    if (!challengeId) throw new Error("UNAUTHORIZED");
    store.set(CHALLENGE_COOKIE, "", { ...challengeMeta, maxAge: 0 });
    if (body.action === "register") {
      await registerEquipmentPasskey(await registrationUser(), challengeId, context,
        body.response as RegistrationResponseJSON, body.label);
      return ok({ registered: true });
    }
    const user = await authenticateEquipmentPasskey(challengeId, body.purpose, context, body.response as AuthenticationResponseJSON);
    const token = createAppSessionToken({ userId: user.id, email: user.email, name: user.name,
      imageUrl: user.imageUrl, provider: "passkey", providerUserId: user.id }, false);
    store.set(APP_SESSION_COOKIE_NAME, token, getAppSessionCookieMeta(false, new URL(request.url).host));
    return ok({ signedIn: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
