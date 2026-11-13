import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireReviewer } from "@/src/server/applications/access";
import { addNote } from "@/src/server/applications/review";

type Context = { params: Promise<{ applicationId: string }> };

const schema = z.object({ kind: z.enum(["NOTE", "INTERVIEW"]), text: z.string().trim().min(1).max(4000) });

/** A private reviewer note or interview-prep question. Applicants never see these. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { applicationId } = await params;
    const { kind, text } = schema.parse(await request.json());
    const note = await addNote(await requireReviewer(), applicationId, kind, text);
    return ok({ id: note.id }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
