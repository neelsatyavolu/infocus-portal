import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireTeleprompterActor, requireTeleprompterDocAccess } from "@/src/server/teleprompter-access";

const createSectionSchema = z.object({
  label: z.string().trim().max(32).optional(),
  content: z.string().max(40_000).optional()
});

function normalizeLabel(rawLabel: string | undefined, nextIndex: number) {
  const trimmed = rawLabel?.trim();
  if (!trimmed) {
    return `A${nextIndex}`;
  }

  return trimmed.slice(0, 32);
}

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const payload = createSectionSchema.parse(await request.json());
    const { docId } = await params;
    const { userId, email } = await requireTeleprompterActor();

    await requireTeleprompterDocAccess({
      docId,
      userId,
      email
    });

    const orderIndex = await prisma.teleprompterSection.count({
      where: {
        docId
      }
    });

    const section = await prisma.teleprompterSection.create({
      data: {
        docId,
        label: normalizeLabel(payload.label, orderIndex + 1),
        content: payload.content ?? "",
        orderIndex
      }
    });

    return ok(mapSection(section), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
