import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { reformatTeleprompterScriptContent } from "@/src/lib/teleprompter-announcement-formatting";
import { requireTeleprompterActor, requireTeleprompterDocAccess } from "@/src/server/teleprompter-access";

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

function mapDoc(doc: {
  id: string;
  title: string;
  orderIndex: number;
  showDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<{
    id: string;
    label: string;
    content: string;
    orderIndex: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return {
    id: doc.id,
    title: doc.title,
    orderIndex: doc.orderIndex,
    showDate: doc.showDate?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    sections: doc.sections.map(mapSection)
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const { userId, email } = await requireTeleprompterActor();

    await requireTeleprompterDocAccess({
      docId,
      userId,
      email
    });

    const doc = await prisma.teleprompterDoc.findUnique({
      where: {
        id: docId
      },
      include: {
        sections: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!doc) {
      throw new Error("NOT_FOUND");
    }

    const reformattedSections: Array<{
      id: string;
      content: string;
    }> = [];
    for (const section of doc.sections) {
      const content = section.content.trim() ? await reformatTeleprompterScriptContent(section.content, section.label) : section.content;
      reformattedSections.push({
        id: section.id,
        content
      });
    }

    await prisma.$transaction(
      reformattedSections.map((section) =>
        prisma.teleprompterSection.update({
          where: {
            id: section.id
          },
          data: {
            content: section.content
          }
        })
      )
    );

    const updated = await prisma.teleprompterDoc.findUnique({
      where: {
        id: docId
      },
      include: {
        sections: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!updated) {
      throw new Error("NOT_FOUND");
    }

    return ok(mapDoc(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}
