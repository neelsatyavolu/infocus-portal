import { WorkspaceRole } from "@prisma/client";
import { syncUserProfile } from "@/src/lib/auth";
import { versionApprovedInStage } from "@/src/lib/initial-cut-review-versions";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { resolvePlaybackUrl, resolveThumbnailUrl } from "@/src/lib/media-playback";
import { initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import type { MediaReviewDto } from "@/src/lib/types";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";
import { initialCutReviewClosed } from "@/src/server/comment-access";
import { requireMediaAccess } from "@/src/server/memberships";
import { loadApprovalView } from "@/src/server/package-approval-service";

export type MediaReviewData = {
  data: MediaReviewDto;
  canViewShareLinks: boolean;
  allowComment: boolean;
  isInitialCut: boolean;
};

/**
 * Everything the review page (`/projects/[projectId]/review/[mediaId]`) renders, also served as JSON
 * by `GET /api/media/[mediaId]/review`. Returns null when the viewer has no access or the item is
 * missing (or, with `projectId`, sits in another project).
 * `version` picks the selected version by id or by version number; otherwise the current one.
 */
export async function getMediaReviewData({
  mediaId,
  projectId,
  version: requestedVersion
}: {
  mediaId: string;
  projectId?: string | null;
  version?: { id: string } | { number: number } | null;
}): Promise<MediaReviewData | null> {
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
      where: projectId ? { id: mediaId, projectId } : { id: mediaId },
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

  const selectedVersion = requestedVersion
    ? media.versions.find((version) =>
        "id" in requestedVersion ? version.id === requestedVersion.id : version.versionNumber === requestedVersion.number
      )
    : null;
  const currentVersion = selectedVersion ?? media.currentVersion ?? media.versions[0];
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
    isInitialCut: Boolean(initialCutRow),
    data: {
      mediaId: media.id,
      projectId: media.projectId,
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
