import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { setCrewNames } from "@/src/server/show-cast";

const schema = z.object({
  date: z.string().regex(DATE_KEY_PATTERN),
  role: z.enum(["Filmers", "Editors"]),
  names: z.array(z.string().trim().max(80)).max(20)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }
    const payload = schema.parse(await request.json());
    return ok(await setCrewNames(payload.date, payload.role, payload.names));
  } catch (error) {
    return handleRouteError(error);
  }
}
