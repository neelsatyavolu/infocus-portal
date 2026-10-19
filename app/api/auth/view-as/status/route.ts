import { handleRouteError } from "@/src/lib/api-errors";
import { getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { okNoStore } from "@/src/lib/http";
import { canControlViewAs } from "@/src/lib/view-as";

type Person = { userId: string; email: string | null; name: string | null };

const person = (user: Person) => ({ id: user.userId, name: user.name, email: user.email });

/** Read-only View as state for the signed-in person: whether it is on and whether they may use it. */
export async function GET() {
  try {
    const real = await getRealSessionUser();
    if (!real) {
      throw new Error("UNAUTHORIZED");
    }
    const effective = await getSessionUser();
    const active = Boolean(effective && effective.userId !== real.userId);

    return okNoStore({
      active,
      allowed: canControlViewAs(real.email),
      realUser: person(real),
      actingAs: active && effective ? person(effective) : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
