import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireTeleprompterActor, requireTeleprompterSectionAccess } from "@/src/server/teleprompter-access";

const updateSectionSchema = z
  .object({
    label: z.string().trim().min(1).max(32).optional(),
    content: z.string().max(40_000).optional()
  })
  .refine((payload) => payload.label !== undefined || payload.content !== undefined, {
    message: "At least one field must be provided."
  });

function mapSection(section: {
  id: string;
  label: string;
  content: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: section.id,
    label: section.label,
    content: section.content,
    orderIndex: section.orderIndex,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString()
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  try {
    const payload = updateSectionSchema.parse(await request.json());
    const { sectionId } = await params;
    const { userId, email } = await requireTeleprompterActor();

    await requireTeleprompterSectionAccess({
      sectionId,
      userId,
      email
    });

    const updated = await prisma.teleprompterSection.update({
      where: {
        id: sectionId
      },
      data: {
        ...(payload.label !== undefined ? { label: payload.label.trim() } : {}),
        ...(payload.content !== undefined ? { content: payload.content } : {})
      }
    });

    return ok(mapSection(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  try {
    const { sectionId } = await params;
    const { userId, email } = await requireTeleprompterActor();

    await requireTeleprompterSectionAccess({
      sectionId,
      userId,
      email
    });

    await prisma.teleprompterSection.delete({
      where: {
        id: sectionId
      }
    });

    return ok({
      id: sectionId
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
