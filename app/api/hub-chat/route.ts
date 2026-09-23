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

export async function GET() {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);
    return ok(await listHubInbox(userId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);
    const payload = openSchema.parse(await request.json());
    return ok(await openHubChat(userId, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
