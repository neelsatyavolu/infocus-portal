import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { TELEPROMPTER_TIME_ZONE, getNextShowDate } from "@/src/lib/teleprompter-template";
import { loadA2Bulletin } from "@/src/server/teleprompter-bulletin";
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
      },
      include: {
        doc: {
          select: {
            showDate: true
          }
        }
      }
    });

    if (!section) {
      throw new Error("NOT_FOUND");
    }

    const showDate = section.doc.showDate ?? getNextShowDate(new Date(), TELEPROMPTER_TIME_ZONE);
    const bulletin = await loadA2Bulletin(showDate);
    const content = bulletin.content ? `BULLETIN\n\n${bulletin.content}` : "BULLETIN";

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
