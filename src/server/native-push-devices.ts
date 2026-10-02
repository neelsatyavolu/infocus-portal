import { z } from "zod";
import { getRealSessionUser } from "@/src/lib/auth";
import { isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

/** Macs running the InFocus app (Apple Push device tokens). */

export const nativeDeviceSchema = z.object({
  token: z.string().trim().regex(/^[0-9a-fA-F]{64,200}$/, "Invalid device token.").transform((token) => token.toLowerCase()),
  environment: z.enum(["production", "development"]),
  appVersion: z.string().trim().max(40).optional()
});

export const nativeDeviceDeleteSchema = z.object({
  token: z.string().trim().regex(/^[0-9a-fA-F]{64,200}$/, "Invalid device token.").transform((token) => token.toLowerCase())
});

/**
 * The signed-in person behind the request, ignoring View as: a Mac belongs to whoever
 * actually signed in on it, never to the account an admin is viewing as.
 */
export async function requireRealUserId() {
  const real = await getRealSessionUser();
  if (!real?.userId) throw new Error("UNAUTHORIZED");
  if (!(await isEmailAllowedToUsePlatform(real.email))) throw new Error("FORBIDDEN");
  return real.userId;
}

/** A token moves to whoever registers it last (e.g. someone else signs in on that Mac). */
export async function registerNativePushDevice(userId: string, input: z.infer<typeof nativeDeviceSchema>) {
  await prisma.nativePushDevice.upsert({
    where: { token: input.token },
    update: { userId, environment: input.environment, appVersion: input.appVersion ?? null },
    create: { userId, token: input.token, environment: input.environment, appVersion: input.appVersion ?? null }
  });
}

export async function removeNativePushDevice(userId: string, token: string) {
  const { count } = await prisma.nativePushDevice.deleteMany({ where: { userId, token } });
  return count;
}
