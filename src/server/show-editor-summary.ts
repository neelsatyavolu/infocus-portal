import { prisma } from "@/src/lib/prisma";
import type { ShowEditStage, ShowEditStatus } from "@/src/lib/show-editor";
import type { ShowEditSummary } from "@/src/lib/show-editor-views";

/**
 * The Show's one-line summary of a date's automatic edit: the latest job's status and stage, and whether the
 * show went to YouTube. Two small reads, so The Show never lists Drive or signs preview links for it.
 */
export async function showEditSummary(showDate: string): Promise<ShowEditSummary> {
  const [job, publication] = await Promise.all([
    prisma.showEditJob.findFirst({ where: { showDate }, orderBy: { createdAt: "desc" }, select: { status: true, stage: true } }),
    prisma.showPublication.findUnique({ where: { showDate }, select: { status: true } })
  ]);
  return {
    status: (job?.status as ShowEditStatus | undefined) ?? null,
    stage: (job?.stage as ShowEditStage | null | undefined) ?? null,
    publicationStatus: publication?.status ?? null
  };
}
