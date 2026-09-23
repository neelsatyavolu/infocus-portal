import { notFound } from "next/navigation";
import { GuestPermission } from "@prisma/client";
import { ReviewShell } from "@/components/review-shell";
import { resolvePlaybackUrl, resolveThumbnailUrl } from "@/src/lib/media-playback";
import { isGuestLinkActive, verifyPasscode } from "@/src/lib/guest-links";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { MediaReviewDto } from "@/src/lib/types";

type GuestPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ passcode?: string }>;
};

async function getGuestReviewData(token: string, passcode?: string): Promise<{
  mediaData: MediaReviewDto;
  permission: GuestPermission;
} | null> {
  const link = await prisma.guestLink.findUnique({
    where: { token },
    include: {
      mediaVersion: {
        include: {
          mediaItem: {
            include: {
              project: {
                include: {
                  workspace: true
                }
              },
              folder: {
                select: {
                  name: true
                }
              },
              versions: {
                include: {
                  comments: {
                    include: {
                      author: {
                        select: {
                          name: true,
                          nickname: true,
                          email: true,
                          id: true
                        }
                      }
                    },
                    orderBy: { createdAt: "asc" }
                  }
                },
                orderBy: { versionNumber: "desc" }
              },
              currentVersion: true
            }
          }
        }
      },
      project: {
        include: {
          mediaItems: {
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
              versions: {
                include: {
                  comments: {
                    include: {
                      author: {
                        select: {
                          name: true,
                          nickname: true,
                          email: true,
                          id: true
                        }
                      }
                    },
                    orderBy: { createdAt: "asc" }
                  }
                },
                orderBy: { versionNumber: "desc" }
              },
              currentVersion: true
            },
            orderBy: { updatedAt: "desc" },
            take: 1
          },
          workspace: true
        }
      }
    }
  });

  if (!link || !isGuestLinkActive(link)) {
    return null;
  }

  if (link.passcodeHash) {
    if (!passcode || !verifyPasscode(passcode, link.passcodeHash)) {
      return null;
    }
  }

  const mediaItem = link.mediaVersion?.mediaItem ?? link.project?.mediaItems[0];
  if (!mediaItem) {
    return null;
  }

  const currentVersion = link.mediaVersion ?? mediaItem.currentVersion ?? mediaItem.versions[0];

  const mediaData: MediaReviewDto = {
    mediaId: mediaItem.id,
    projectId: mediaItem.projectId,
    projectName: mediaItem.project.name,
    folderName: mediaItem.folder?.name ?? null,
    title: mediaItem.title,
    workspaceRole: "REVIEWER",
    canUpdateApprovalStatus: false,
    canManageQuickGrades: false,
    currentUserId: null,
    assignedPeople: [],
    currentVersionId: currentVersion?.id ?? "",
    versions: await Promise.all(
      mediaItem.versions.map(async (version) => {
        const playbackUrl =
          version.sourceType === "VIDEO" && version.status === "READY"
            ? await resolvePlaybackUrl(version)
            : null;

        return {
          id: version.id,
          versionNumber: version.versionNumber,
          bunnyVideoId: version.bunnyVideoId,
          sourceType: version.sourceType,
          status: version.status,
          approvalStatus: version.approvalStatus,
          airedAt: version.airedAt?.toISOString() ?? null,
          playbackUrl,
          thumbnailUrl: await resolveThumbnailUrl(version),
          imageUrl:
            version.sourceType === "IMAGE" ? buildMediaVersionImageUrl(mediaItem.id, version.id, token) : null,
          createdAt: version.createdAt.toISOString()
        };
      })
    ),
    comments: mediaItem.versions.flatMap((version) =>
      version.comments.map((comment) => ({
        id: comment.id,
        mediaVersionId: comment.mediaVersionId,
        body: comment.body,
        authorId: comment.authorId,
        authorName: comment.author ? userDisplayName(comment.author) || "Guest" : "Guest",
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
  };

  return {
    mediaData,
    permission: link.permission
  };
}

export default async function GuestReviewPage({ params, searchParams }: GuestPageProps) {
  const { token } = await params;
  const { passcode } = await searchParams;

  const payload = await getGuestReviewData(token, passcode);

  if (!payload) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-6">
        <form className="w-full space-y-4 rounded-2xl border border-border bg-card p-6" method="GET">
          <h1 className="text-xl font-semibold text-foreground">Protected Review Link</h1>
          <p className="text-sm text-muted-foreground">This link may be revoked/expired, or requires a valid passcode.</p>
          <input
            name="passcode"
            type="password"
            placeholder="Enter passcode"
            className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground"
          />
          <button className="h-10 w-full rounded-lg bg-primary font-semibold text-primary-foreground">Open Link</button>
        </form>
      </main>
    );
  }

  if (!payload.mediaData) {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Guest Review</h1>
        <p className="text-sm text-muted-foreground">You are viewing with {payload.permission.toLowerCase()} permissions.</p>
      </header>
      <ReviewShell
        data={payload.mediaData}
        guestToken={token}
        isGuest={payload.permission === GuestPermission.VIEW}
        allowComment={payload.permission === GuestPermission.COMMENT}
      />
    </main>
  );
}
