import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { reformatTeleprompterScriptContent } from "@/src/lib/teleprompter-announcement-formatting";
import { requireTeleprompterActor, requireTeleprompterSectionAccess } from "@/src/server/teleprompter-access";

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

    const section = await prisma.teleprompterSection.findUnique({
      where: {
        id: sectionId
      }
    });

    if (!section) {
      throw new Error("NOT_FOUND");
    }

    const content = await reformatTeleprompterScriptContent(section.content, section.label);
    const updated = await prisma.teleprompterSection.update({
      where: {
        id: sectionId
      },
      data: {
        content
      }
    });

    return ok(mapSection(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}
