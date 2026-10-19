import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { getMediaReviewData } from "@/src/server/media-review";

// `version` is a version id, or a version number (digits only).
const querySchema = z.object({
  version: z.string().trim().min(1).max(64).optional()
});

/**
 * What the review page (`/projects/[projectId]/review/[mediaId]`) renders, as JSON: the item, its
 * versions with signed playback URLs, every version's comments, package review state and the
 * viewer's permission flags. Same access as the page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const { version } = querySchema.parse({
      version: new URL(request.url).searchParams.get("version") ?? undefined
    });

    const review = await getMediaReviewData({
      mediaId,
      version: version ? (/^\d+$/.test(version) ? { number: Number(version) } : { id: version }) : null
    });
    if (!review) {
      throw new Error("NOT_FOUND");
    }

    return ok({
      ...review.data,
      allowComment: review.allowComment,
      isInitialCut: review.isInitialCut,
      canViewShareLinks: review.canViewShareLinks
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
