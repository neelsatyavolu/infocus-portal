import { ImageResponse } from "next/og";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { certificateFileName } from "@/src/lib/package-of-cycle";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { loadCertificateData } from "@/src/server/package-of-cycle";
import {
  CERTIFICATE_SIZE,
  loadCertificateAssets,
  renderCertificate
} from "@/src/server/package-of-cycle-certificate";

const querySchema = z.object({
  rowId: z.string().min(1),
  /** Defaults to the signed-in member. */
  memberId: z.string().min(1).optional()
});

/** PNG certificate for one member of a Package of the Cycle winner. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [data, assets] = await Promise.all([
      loadCertificateData({
        rowId: query.rowId,
        memberUserId: query.memberId ?? userId,
        viewerUserId: userId,
        role: access.role
      }),
      loadCertificateAssets()
    ]);
    const fileName = certificateFileName(data.cycleNumber, data.name);

    return new ImageResponse(renderCertificate(data, assets.images), {
      ...CERTIFICATE_SIZE,
      fonts: assets.fonts.length ? assets.fonts : undefined,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]|"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
