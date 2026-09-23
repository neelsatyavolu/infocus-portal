import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

type ActivityInput = {
  workspaceId: string;
  projectId?: string;
  mediaItemId?: string;
  mediaVersionId?: string;
  commentId?: string;
  guestLinkId?: string;
  actorId?: string;
  type: string;
  payload?: Prisma.InputJsonValue;
};

type AuditInput = {
  workspaceId: string;
  projectId?: string;
  mediaItemId?: string;
  mediaVersionId?: string;
  commentId?: string;
  guestLinkId?: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
};

export async function recordActivity(input: ActivityInput) {
  return prisma.activityEvent.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      mediaItemId: input.mediaItemId,
      mediaVersionId: input.mediaVersionId,
      commentId: input.commentId,
      guestLinkId: input.guestLinkId,
      actorId: input.actorId,
      type: input.type,
      payload: input.payload
    }
  });
}

export async function recordAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      mediaItemId: input.mediaItemId,
      mediaVersionId: input.mediaVersionId,
      commentId: input.commentId,
      guestLinkId: input.guestLinkId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata
    }
  });
}
