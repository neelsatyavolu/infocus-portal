import type { Metadata } from "next";
import { GuestPermission } from "@prisma/client";
import { Alert } from "@/components/kit/alert";
import { ReviewShell } from "@/components/review-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * Either the review, or `blocked`: unknown, revoked or expired link, missing or wrong passcode, or
 * nothing to review. These are deliberately not told apart, so the page never confirms that a
 * token exists, is active or has a passcode.
 */
type GuestReviewLookup = { status: "ok"; mediaData: MediaReviewDto; permission: GuestPermission } | { status: "blocked" };

async function getGuestReviewData(token: string, passcode?: string): Promise<GuestReviewLookup> {
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
    return { status: "blocked" };
  }

  if (link.passcodeHash) {
    if (!passcode || !verifyPasscode(passcode, link.passcodeHash)) {
      return { status: "blocked" };
    }
  }

  const mediaItem = link.mediaVersion?.mediaItem ?? link.project?.mediaItems[0];
  if (!mediaItem) {
    return { status: "blocked" };
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
    status: "ok",
    mediaData,
    permission: link.permission
  };
}

export const metadata: Metadata = { title: "Guest review" };

/** A slim brand line for guests (no app shell): the wordmark and what this page is. */
function GuestBrandRow() {
  return (
    <div className="mb-4 flex h-10 items-center gap-3">
      <span className="wordmark text-foreground">InFocus Portal</span>
      <span aria-hidden className="h-4 w-px bg-border" />
      <span className="text-sm text-muted-foreground">Guest review</span>
    </div>
  );
}

/**
 * The one page every blocked link gets (same GET form and ?passcode= as before). After a passcode
 * was tried, an alert covers every reason it can fail, since the page doesn't say which.
 */
function GuestGate({ passcodeTried }: { passcodeTried: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-sm space-y-5 rounded-md border border-border bg-card p-6">
        <div className="space-y-1.5">
          <p className="eyebrow">Guest review</p>
          <h1 className="display-sm text-foreground">Protected review link</h1>
          <p className="text-sm text-[var(--ink-text)]">This link may be revoked or expired, or it needs a valid passcode.</p>
        </div>
        {passcodeTried ? (
          <Alert tone="danger" compact>
            That passcode didn&apos;t work, or this link has expired or been revoked.
          </Alert>
        ) : null}
        <form method="GET" className="space-y-3">
          <label htmlFor="guest-passcode" className="sr-only">
            Passcode
          </label>
          <Input
            id="guest-passcode"
            name="passcode"
            type="password"
            placeholder="Enter passcode"
            autoComplete="off"
            autoFocus
            aria-invalid={passcodeTried || undefined}
          />
          <Button type="submit" className="w-full">
            Open link
          </Button>
        </form>
      </div>
    </main>
  );
}

export default async function GuestReviewPage({ params, searchParams }: GuestPageProps) {
  const { token } = await params;
  const { passcode } = await searchParams;

  const lookup = await getGuestReviewData(token, passcode);

  if (lookup.status !== "ok") {
    return <GuestGate passcodeTried={Boolean(passcode)} />;
  }

  return (
    <main className="min-h-dvh p-4 md:p-6">
      <GuestBrandRow />
      <ReviewShell
        data={lookup.mediaData}
        guestToken={token}
        isGuest={lookup.permission === GuestPermission.VIEW}
        allowComment={lookup.permission === GuestPermission.COMMENT}
      />
    </main>
  );
}
