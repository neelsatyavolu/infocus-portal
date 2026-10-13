import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceRole } from "@prisma/client";
import { ProjectShellBridge } from "@/components/project-shell-bridge";
import { ReviewShell } from "@/components/review-shell";
import { resolvePlaybackUrl, resolveThumbnailUrl } from "@/src/lib/media-playback";
import { syncUserProfile } from "@/src/lib/auth";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";
import { initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import { versionApprovedInStage } from "@/src/lib/initial-cut-review-versions";
import { MediaReviewDto } from "@/src/lib/types";
import { initialCutReviewClosed } from "@/src/server/comment-access";
import { loadApprovalView } from "@/src/server/package-approval-service";
import { reconcileProjectMediaStatuses } from "@/src/server/media-reconcile";
import { requireMediaAccess } from "@/src/server/memberships";
import { projectHasPendingMediaVersions } from "@/src/server/project-media";
import { getProjectShellData } from "@/src/server/project-shell";

async function getReviewData(
  projectId: string,
  mediaId: string,
  requestedVersionId?: string | null
): Promise<{ data: MediaReviewDto; canViewShareLinks: boolean; allowComment: boolean } | null> {
  let membership: Awaited<ReturnType<typeof requireMediaAccess>>["membership"];
  let currentUserId: string | null = null;
  let canUpdateApprovalStatus = false;
  let canManageQuickGrades = false;
  let canViewShareLinks = false;
  let reviewerEmail: string | null = null;
  let reviewerRole: Awaited<ReturnType<typeof getPlatformAccess>>["role"] = null;
  try {
    const access = await requireMediaAccess(
      mediaId,
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      { allowVisibility: true }
    );
    membership = access.membership;
    currentUserId = access.userId;
    canViewShareLinks = access.isDirectMember;
    const user = await syncUserProfile(access.userId);
    const platformAccess = await getPlatformAccess(user.email);
    reviewerEmail = user.email;
    reviewerRole = platformAccess.role;
    canUpdateApprovalStatus = platformAccess.canManageWorkspaces;
    canManageQuickGrades = hasPlatformRole(platformAccess.role, "EXECUTIVE_PRODUCER");
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "NOT_FOUND")) {
      return null;
    }

    throw error;
  }

  // The package-row lookup only needs the id from the URL, so it runs alongside the media query.
  const [media, initialCutRow] = await Promise.all([
    prisma.mediaItem.findFirst({
      where: { id: mediaId, projectId },
      include: {
        project: {
          select: {
            name: true
          }
        },
        folder: {
          select: {
            name: true
          }
        },
        memberAssignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                nickname: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: "asc" }
        },
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            comments: {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    nickname: true,
                    email: true
                  }
                }
              },
              orderBy: { createdAt: "asc" }
            }
          }
        },
        currentVersion: true
      }
    }),
    prisma.packageProgressRow.findFirst({
      where: { initialCutMediaItemId: mediaId },
      select: {
        id: true,
        approval: {
          select: {
            stage: true,
            signoffs: { select: { stage: true, approved: true, createdAt: true } }
          }
        },
        initialCutMediaItem: {
          select: { versions: { select: { id: true, versionNumber: true, createdAt: true } } }
        }
      }
    })
  ]);

  if (!media) {
    return null;
  }

  const requestedVersion = requestedVersionId
    ? media.versions.find((version) => version.id === requestedVersionId)
    : null;
  const currentVersion = requestedVersion ?? media.currentVersion ?? media.versions[0];
  // Independent lookups (a missing approval row reads as "review open" either way), so run them together.
  const [approvalView, reviewClosed] =
    initialCutRow && currentUserId
      ? await Promise.all([
          loadApprovalView(initialCutRow.id, {
            userId: currentUserId,
            email: reviewerEmail,
            role: reviewerRole
          }),
          initialCutReviewClosed(media.id, currentUserId, reviewerRole)
        ])
      : [null, false];
  const packageReview =
    initialCutRow && currentUserId && approvalView
      ? {
          rowId: initialCutRow.id,
          kind: "initial-cut" as const,
          stage: approvalView.stage,
          canSubmitReview: approvalView.canAct,
          canApprove: approvalView.canAct,
          canUnapprove: approvalView.canUnapprove,
          canApproveAnyway: approvalView.canApproveAnyway,
          awaitingRevisedInitialCut: approvalView.awaitingRevisedInitialCut,
          remainingExecutiveSignoffs: approvalView.remainingExecutiveSignoffs
        }
      : null;

  const allowComment = !reviewClosed;

  return {
    canViewShareLinks,
    allowComment,
    data: {
      mediaId: media.id,
      projectId,
      projectName: media.project.name,
      folderName: media.folder?.name ?? null,
      title: initialCutRow ? initialCutVersionTitle(currentVersion?.versionNumber ?? 1) : media.title,
      workspaceRole: membership.role,
      canUpdateApprovalStatus,
      canManageQuickGrades,
      currentUserId,
      packageReview,
      assignedPeople: media.memberAssignments.map((assignment) => ({
        userId: assignment.user.id,
        ...labeledUser(assignment.user)
      })),
      currentVersionId: currentVersion?.id ?? "",
      versions: await Promise.all(
        media.versions.map(async (version) => {
          const [playbackUrl, thumbnailUrl] = await Promise.all([
            version.sourceType === "VIDEO" && version.status === "READY" ? resolvePlaybackUrl(version) : null,
            version.sourceType === "IMAGE"
              ? buildMediaVersionImageUrl(media.id, version.id)
              : resolveThumbnailUrl(version)
          ]);

          return {
            id: version.id,
            versionNumber: version.versionNumber,
            bunnyVideoId: version.bunnyVideoId,
            sourceType: version.sourceType,
            status: version.status,
            approvalStatus: version.approvalStatus,
            approvedInStage: initialCutRow?.initialCutMediaItem
              ? versionApprovedInStage(
                  version.id,
                  initialCutRow.initialCutMediaItem.versions,
                  initialCutRow.approval?.signoffs ?? []
                )
              : null,
            airedAt: version.airedAt?.toISOString() ?? null,
            playbackUrl,
            thumbnailUrl,
            imageUrl: version.sourceType === "IMAGE" ? buildMediaVersionImageUrl(media.id, version.id) : null,
            createdAt: version.createdAt.toISOString()
          };
        })
      ),
      comments: media.versions.flatMap((version) =>
        version.comments.map((comment) => ({
          id: comment.id,
          mediaVersionId: comment.mediaVersionId,
          body: comment.body,
          authorId: comment.authorId,
          authorName: comment.author ? userDisplayName(comment.author) || "Guest Reviewer" : "Guest Reviewer",
          timeSeconds: comment.timeSeconds,
          frameNumber: comment.frameNumber,
          xPct: comment.xPct,
          yPct: comment.yPct,
          targetType: comment.targetType,
          createdAt: comment.createdAt.toISOString(),
          resolvedAt: comment.resolvedAt?.toISOString() ?? null,
          parentCommentId: comment.parentCommentId
        }))
      )
    }
  };
}

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
    getReviewData(projectId, mediaId, query.version)
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
      <ReviewShell
        key={`${review.data.mediaId}:${review.data.currentVersionId}`}
        data={review.data}
        allowComment={review.allowComment}
      />
    </>
  );
}
