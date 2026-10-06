import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { listMeetingCuts } from "@/src/server/meetings-cuts";

export const dynamic = "force-dynamic";

const querySchema = z.object({ cycle: z.coerce.number().int().min(1).max(1000).optional() });

export async function GET(request: Request) {
  try {
    await requireMeetingViewer();
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({ cycle: searchParams.get("cycle") ?? undefined });
    return ok(await listMeetingCuts(query.cycle));
  } catch (error) {
    return handleRouteError(error);
  }
}
