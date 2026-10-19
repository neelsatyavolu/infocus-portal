import { handleRouteError } from "@/src/lib/api-errors";
import { getRealSessionUser } from "@/src/lib/auth";
import { okNoStore } from "@/src/lib/http";
import { getVaultActor } from "@/src/server/password-vault";

/** The signed-in person's Passwords access, by the same rule the /passwords page uses. */
export async function GET() {
  try {
    const real = await getRealSessionUser();
    if (!real?.userId) {
      throw new Error("UNAUTHORIZED");
    }
    const actor = await getVaultActor();
    return okNoStore({
      level: actor?.access ?? "none",
      canShare: actor?.canShare ?? false,
      canDeleteAny: actor?.canDeleteAny ?? false
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
