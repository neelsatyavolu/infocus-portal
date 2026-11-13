import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireReviewer } from "@/src/server/applications/access";
import { addNote } from "@/src/server/applications/review";

type Context = { params: Promise<{ applicationId: string }> };

// Transcripts are long (a 20-minute interview is ~3,000 words); notes and questions stay short.
const schema = z
  .object({ kind: z.enum(["NOTE", "INTERVIEW", "TRANSCRIPT"]), text: z.string().trim().min(1).max(100_000) })
  .refine((input) => input.kind === "TRANSCRIPT" || input.text.length <= 4000, { message: "Keep notes under 4,000 characters." });

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
