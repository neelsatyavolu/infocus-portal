import { z } from "zod";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, okUnmapped } from "@/src/lib/http";
import { loadPaPage, savePaScript } from "@/src/server/pa-scripts";

export const maxDuration = 60;

const saveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  content: z.string().max(100000),
  version: z.number().int().positive()
});

async function actor() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  return { userId: user.id, email: user.email };
}

function routeError(error: unknown) {
  if (error instanceof Error && error.message === "CONFLICT") {
    return fail("The script changed since you opened it. Copy your edits, then discard changes and refresh to load the latest version.", 409);
  }
  if (error instanceof Error && error.message === "PA_REGENERATE_EMPTY") {
    return fail("No announcements could be loaded for this PA date. Your script has been kept. Try again later.", 503);
  }
  return handleRouteError(error);
}

export async function GET() {
  try {
    return okUnmapped(await loadPaPage(await actor()));
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await actor();
    const input = saveSchema.parse(await request.json());
    return okUnmapped(await savePaScript(user, input));
  } catch (error) {
    return routeError(error);
  }
}


export async function POST(request: Request) {
  try {
    const user = await actor();
    const input = saveSchema.omit({ content: true }).parse(await request.json());
    return okUnmapped(await savePaScript(user, { ...input, regenerate: true }));
  } catch (error) {
    return routeError(error);
  }
}
