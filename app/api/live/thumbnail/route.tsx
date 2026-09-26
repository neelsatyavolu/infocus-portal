import { ImageResponse } from "next/og";
import { handleRouteError } from "@/src/lib/api-errors";
import { THUMBNAIL_SIZES, thumbnailFileName, thumbnailQuerySchema } from "@/src/lib/live/thumbnail";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireLiveAccess } from "@/src/server/live-access";
import { loadThumbnailAssets, loadThumbnailFonts, renderThumbnail } from "@/src/server/live-thumbnail";

export async function GET(request: Request) {
  try {
    await requireLiveAccess();
    const limit = limitByKey(getRequestKey(request, "live:thumbnail"), { max: 120, windowMs: 60_000 });
    if (!limit.allowed) throw new Error("TOO_MANY_REQUESTS");

    const query = thumbnailQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [assets, fonts] = await Promise.all([loadThumbnailAssets(), loadThumbnailFonts()]);
    const size = THUMBNAIL_SIZES[query.format];
    const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
    if (query.download) headers["Content-Disposition"] = `attachment; filename="${thumbnailFileName(query)}"`;

    return new ImageResponse(renderThumbnail(query, assets), {
      width: size.width,
      height: size.height,
      fonts: fonts.length ? fonts : undefined,
      headers
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
