import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { MAX_FINAL_CUT_EFFORT_POINTS, MAX_FINAL_CUT_QUALITY_POINTS } from "@/src/lib/package-final-cut-scores";
import { parseDateInput } from "@/src/lib/extensions";
import { getPlatformAccess, isExecutiveProducer } from "@/src/lib/platform-admin";
import { saveFinalCutGrade } from "@/src/server/package-cycle-stage";

const schema = z.object({
  rowId: z.string().min(1),
  scores: z
    .array(
      z.object({
        memberUserId: z.string().min(1),
        qualityPoints: z.number().min(0).max(MAX_FINAL_CUT_QUALITY_POINTS),
        effortPoints: z.number().min(0).max(MAX_FINAL_CUT_EFFORT_POINTS)
      })
    )
    .min(1)
    .max(20)
    .refine((scores) => new Set(scores.map((score) => score.memberUserId)).size === scores.length),
  turnedInDate: z.string().nullable().optional()
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!isExecutiveProducer(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const payload = schema.parse(await request.json());
    const result = await saveFinalCutGrade({
      rowId: payload.rowId,
      graderUserId: userId,
      role: access.role,
      scores: payload.scores,
      turnedInDate: payload.turnedInDate === undefined ? undefined : parseDateInput(payload.turnedInDate)
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
