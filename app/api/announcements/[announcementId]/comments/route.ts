import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ announcementId: string }> }
) {
  try {
    const { announcementId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = createCommentSchema.parse(await request.json());

    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true }
    });

    if (!announcement) {
      throw new Error("NOT_FOUND");
    }

    const comment = await prisma.announcementComment.create({
      data: {
        announcementId,
        authorId: user.id,
        body: payload.body.trim()
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            nickname: true
          }
        }
      }
    });

    await prisma.announcementRead.upsert({
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

    return ok(
      {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: comment.author
          ? { id: comment.author.id, name: userDisplayName(comment.author) }
          : { id: "", name: "Deleted user" }
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
