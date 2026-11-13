import { handleRouteError } from "@/src/lib/api-errors";
import { requireReviewer } from "@/src/server/applications/access";
import { exportRoundCsv } from "@/src/server/applications/review";

type Context = { params: Promise<{ roundId: string }> };

/** The comparison table as CSV (reviewers only). */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    const csv = await exportRoundCsv(await requireReviewer(), roundId);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="applications-${roundId}.csv"`,
        "Cache-Control": "no-store, private"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
