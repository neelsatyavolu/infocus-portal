import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceRole } from "@prisma/client";
import { ProjectShellBridge } from "@/components/project-shell-bridge";
import { ReviewShell } from "@/components/review-shell";
import { prisma } from "@/src/lib/prisma";
import { getMediaReviewData } from "@/src/server/media-review";
import { reconcileProjectMediaStatuses } from "@/src/server/media-reconcile";
import { requireMediaAccess } from "@/src/server/memberships";
import { projectHasPendingMediaVersions } from "@/src/server/project-media";
import { getProjectShellData } from "@/src/server/project-shell";

export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string; mediaId: string }>;
}): Promise<Metadata> {
  const { projectId, mediaId } = await params;
  try {
    const { media } = await requireMediaAccess(
      mediaId,
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      { allowVisibility: true }
    );
    if (media.projectId !== projectId) return { title: "Review" };
    // Initial cuts show a version title on the page instead of the file title.
    const initialCutRow = await prisma.packageProgressRow.findFirst({
      where: { initialCutMediaItemId: mediaId },
      select: { id: true }
    });
    return { title: initialCutRow ? "Initial Cut" : media.title || "Review" };
  } catch {
    return { title: "Review" };
  }
}

export default async function ReviewPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string; mediaId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const [{ projectId, mediaId }, query] = await Promise.all([params, searchParams]);

  const [hasPendingVersions, review] = await Promise.all([
    projectHasPendingMediaVersions(projectId),
    getMediaReviewData({ mediaId, projectId, version: query.version ? { id: query.version } : null })
  ]);

  if (hasPendingVersions) {
    void reconcileProjectMediaStatuses(projectId).catch(() => undefined);
  }

  if (!review) {
    notFound();
  }

  const shellData = await getProjectShellData({
    projectId,
    mediaId,
    canViewShareLinks: review.canViewShareLinks
  });

  return (
    <>
      <ProjectShellBridge data={shellData} />
      <ReviewShell data={review.data} allowComment={review.allowComment} isInitialCut={review.isInitialCut} />
    </>
  );
}
