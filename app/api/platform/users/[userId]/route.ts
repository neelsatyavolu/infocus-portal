import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok, okUnmapped } from "@/src/lib/http";
import { NICKNAME_MAX_LENGTH, normalizeNickname } from "@/src/lib/user-display";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { revokeNasUsers } from "@/src/lib/drive-user-sync";
import { prisma } from "@/src/lib/prisma";

const updateUserSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  nickname: z.string().max(NICKNAME_MAX_LENGTH).nullable().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAllowedEmails) {
      throw new Error("FORBIDDEN");
    }

    const payload = updateUserSchema.parse(await request.json());
    const nextName = payload.name !== undefined ? payload.name?.trim() ?? "" : undefined;
    const hasNickname = payload.nickname !== undefined;

    const existing = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true }
    });

    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(nextName !== undefined ? { name: nextName || null } : {}),
        ...(hasNickname ? { nickname: normalizeNickname(payload.nickname) } : {})
      },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        createdAt: true
      }
    });

    return okUnmapped(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAllowedEmails) {
      throw new Error("FORBIDDEN");
    }

    if (targetUserId === userId) {
      throw new Error("You can't delete your own user record.");
    }

    const existing = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true }
    });

    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    // Creator/author relations use onDelete: SetNull, so deleting the user
    // preserves their work and orphans the creator field (shown as "Deleted user")
    // instead of blocking the deletion.
    await prisma.$transaction(async (tx) => {
      if (existing.email) {
        await tx.platformRoleAssignment.deleteMany({
          where: { email: existing.email }
        });
      }

      await tx.user.delete({
        where: { id: targetUserId }
      });
    });

    if (existing.email) {
      await revokeNasUsers([existing.email]);
    }

    return ok({ id: targetUserId });
  } catch (error) {
    return handleRouteError(error);
  }
}
