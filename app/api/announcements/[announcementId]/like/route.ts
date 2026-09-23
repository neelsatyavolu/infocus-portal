import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";

async function ensureAnnouncement(announcementId: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true }
  });

  if (!announcement) {
    throw new Error("NOT_FOUND");
  }
}

async function countLikes(announcementId: string) {
  return prisma.announcementLike.count({
    where: { announcementId }
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ announcementId: string }> }
) {
  try {
    const { announcementId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    await ensureAnnouncement(announcementId);

    await prisma.announcementLike.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId: user.id
        }
      },
      update: {},
      create: {
        announcementId,
        userId: user.id
      }
    });

    const likeCount = await countLikes(announcementId);

    return ok({
      likedByMe: true,
      likeCount
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ announcementId: string }> }
) {
  try {
    const { announcementId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    await ensureAnnouncement(announcementId);

    await prisma.announcementLike.deleteMany({
      where: {
        announcementId,
        userId: user.id
      }
    });

    const likeCount = await countLikes(announcementId);

    return ok({
      likedByMe: false,
      likeCount
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
