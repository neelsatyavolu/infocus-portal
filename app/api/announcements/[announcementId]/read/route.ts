import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ announcementId: string }> }
) {
  try {
    const { announcementId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true }
    });

    if (!announcement) {
      throw new Error("NOT_FOUND");
    }

    const read = await prisma.announcementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId: user.id
        }
      },
      update: {
        readAt: new Date()
      },
      create: {
        announcementId,
        userId: user.id
      }
    });

    return ok({
      announcementId,
      readAt: read.readAt
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
