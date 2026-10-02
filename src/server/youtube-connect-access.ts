import { getRealSessionUser } from "@/src/lib/auth";
import { getPlatformAccess, isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";

/**
 * Reconnect YouTube is for super admins and the adviser, as themselves: View as never
 * counts, so the channel is always connected by a real platform admin.
 */
export async function requireRealPlatformAdmin() {
  const real = await getRealSessionUser();
  if (!real?.userId) throw new Error("UNAUTHORIZED");
  if (!(await isEmailAllowedToUsePlatform(real.email))) throw new Error("FORBIDDEN");
  if (!(await getPlatformAccess(real.email)).canManagePlatformRoles) throw new Error("FORBIDDEN");
  return real.userId;
}
