import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { createRound } from "@/src/server/applications/rounds";

const schema = z.object({ title: z.string().trim().max(120).default("") });

/** Create a hidden draft round from this year's template (EPs + super admin). */
export async function POST(request: Request) {
  try {
    const viewer = await requireManager();
    const { title } = schema.parse(await request.json());
    const round = await createRound(viewer, title);
    return ok({ id: round.id }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
