import { randomBytes } from "node:crypto";
import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireWorkspaceMember } from "@/src/lib/auth";
import { canInviteMembers } from "@/src/lib/rbac";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(WorkspaceRole),
  expiresInDays: z.number().int().min(1).max(30).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const payload = inviteSchema.parse(await request.json());

    const { member, userId } = await requireWorkspaceMember(workspaceId);

    if (!canInviteMembers(member.role)) {
      throw new Error("FORBIDDEN");
    }

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: payload.email.toLowerCase(),
        role: payload.role,
        token: randomBytes(24).toString("base64url"),
        createdById: userId,
        expiresAt: new Date(Date.now() + (payload.expiresInDays ?? 7) * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        type: "workspace.invite.created",
        payload: {
          email: invite.email,
          role: invite.role
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: "workspace.invite.create",
        targetType: "WorkspaceInvite",
        targetId: invite.id,
        metadata: {
          email: invite.email,
          role: invite.role
        }
      }
    });

    return ok(invite, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
