import { handleRouteError } from "@/src/lib/api-errors";
import { getSessionUser } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { loadClassBoard } from "@/src/server/class-board";
import { classBoardPinAllowsAccess } from "@/src/server/class-board-pin";

/** The Class Board (/class-board page): signed in, or a browser unlocked with the board PIN. */
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session && !(await classBoardPinAllowsAccess())) throw new Error("UNAUTHORIZED");
    const platformRole = session?.email ? await getPlatformRoleForEmail(session.email) : null;
    return ok(await loadClassBoard(platformRole));
  } catch (error) {
    return handleRouteError(error);
  }
}
