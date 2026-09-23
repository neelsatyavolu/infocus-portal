import { handleRouteError } from "@/src/lib/api-errors";
import { getRealSessionUser } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { sortNamedPeople } from "@/src/lib/name-sort";
import { prisma } from "@/src/lib/prisma";
import { normalizeEmail } from "@/src/lib/platform-admin";
import { allowedViewAsTargetEmails, canControlViewAs } from "@/src/lib/view-as";

export async function GET() {
  try {
    const real = await getRealSessionUser();
    if (!real) {
      throw new Error("UNAUTHORIZED");
    }
    if (!canControlViewAs(real.email)) {
      throw new Error("FORBIDDEN");
    }

    const allowed = allowedViewAsTargetEmails(real.email);
    const users = await prisma.user.findMany({
      select: { id: true, name: true, nickname: true, email: true, imageUrl: true },
      ...(allowed
        ? {
            where: {
              OR: allowed.map((email) => ({
                email: { equals: email, mode: "insensitive" as const }
              }))
            }
          }
        : {})
    });
    const visible =
      allowed === null
        ? users
        : users.filter((user) => allowed.some((email) => normalizeEmail(email) === normalizeEmail(user.email)));

    return ok(sortNamedPeople(visible, "lastName"));
  } catch (error) {
    return handleRouteError(error);
  }
}
