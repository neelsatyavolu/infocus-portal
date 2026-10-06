import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { listHubInbox, openHubChat } from "@/src/server/hub-chat";

const openSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("GROUP"),
    packageRowId: z.string().min(1)
  }),
  z.object({
    kind: z.literal("DIRECT"),
    userId: z.string().min(1)
  })
]);

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    // ?lite=1: interval polls skip the class roster and never-opened groups.
    const lite = new URL(request.url).searchParams.get("lite") === "1";
    return ok(await listHubInbox(userId, { knownUser: user, lite }));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = openSchema.parse(await request.json());
    return ok(await openHubChat(userId, payload, user));
  } catch (error) {
    return handleRouteError(error);
  }
}
