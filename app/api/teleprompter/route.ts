import { z } from "zod";
import { Prisma } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { resolveAnchorAssignments, syncTeleprompterAnchorNames } from "@/src/server/teleprompter-anchors";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import {
  TELEPROMPTER_TIME_ZONE,
  buildDefaultTeleprompterSections,
  formatShowDateForDocTitle,
  getNextShowDate
} from "@/src/lib/teleprompter-template";
import { loadA2Bulletin, type BulletinAutofill } from "@/src/server/teleprompter-bulletin";
import {
  backfillLegacyTeleprompterDocs,
  requireTeleprompterActor,
  requireTeleprompterWorkspaceAccess,
  resolveTeleprompterWorkspace
} from "@/src/server/teleprompter-access";

const createDocSchema = z.object({
  workspaceId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(140)
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

async function ensureShowDoc(params: {
  workspaceId: string;
  userId: string;
  showDate: Date;
}): Promise<BulletinAutofill> {
  const { workspaceId, userId, showDate } = params;
  const existing = await prisma.teleprompterDoc.findFirst({
    where: {
      workspaceId,
      showDate
    },
    select: {
      id: true
    }
  });

  if (existing) {
    return {
      status: "ok"
    };
  }

  const anchorAssignments = await resolveAnchorAssignments({
    workspaceId,
    showDate
  });
  const bulletin = await loadA2Bulletin(showDate);

  const sections = buildDefaultTeleprompterSections({
    showDate,
    a2BulletinContent: bulletin.content,
    anchorName: anchorAssignments.anchorName,
    coanchorName: anchorAssignments.coanchorName
  });

  const orderIndex = await prisma.teleprompterDoc.count({
    where: {
      workspaceId
    }
  });

  try {
    await prisma.teleprompterDoc.create({
      data: {
        workspaceId,
        showDate,
        title: `InFocus Show - ${formatShowDateForDocTitle(showDate, TELEPROMPTER_TIME_ZONE)}`,
        orderIndex,
        createdById: userId,
        sections: {
          create: sections
        }
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  return bulletin.autofill;
}

export async function GET(request: Request) {
  try {
    const { userId, email } = await requireTeleprompterActor();
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId");
    const requestedShowDate = searchParams.get("showDate")?.trim() ?? "";
    const nextShowDate =
      requestedShowDate && DATE_KEY_PATTERN.test(requestedShowDate)
        ? new Date(`${requestedShowDate}T12:00:00.000Z`)
        : getNextShowDate(new Date(), TELEPROMPTER_TIME_ZONE);
    const nextShowDateIso = nextShowDate.toISOString();

    const workspaceResolution = await resolveTeleprompterWorkspace({
      userId,
      email,
      workspaceId: requestedWorkspaceId
    });

    const selectedWorkspace = workspaceResolution.selectedWorkspace;
    if (!selectedWorkspace) {
      return ok({
        workspaceId: "",
        canEdit: false,
        nextShowDateIso,
        docs: [],
        autofill: {
          status: "unavailable",
          message: "Join or create a workspace to use Teleprompter."
        }
      });
    }

    await backfillLegacyTeleprompterDocs({
      userId,
      workspaceId: selectedWorkspace.id
    });

    const autofill = await ensureShowDoc({
      workspaceId: selectedWorkspace.id,
      userId,
      showDate: nextShowDate
    });

    await syncTeleprompterAnchorNames({ workspaceId: selectedWorkspace.id });

    const docs = await prisma.teleprompterDoc.findMany({
      where: {
        workspaceId: selectedWorkspace.id
      },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      include: {
        sections: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    return ok({
      workspaceId: selectedWorkspace.id,
      canEdit: true,
      nextShowDateIso,
      docs: docs.map(mapDoc),
      autofill
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createDocSchema.parse(await request.json());
    const { userId, email } = await requireTeleprompterActor();

    await requireTeleprompterWorkspaceAccess({
      workspaceId: payload.workspaceId,
      userId,
      email
    });

    const orderIndex = await prisma.teleprompterDoc.count({
      where: {
        workspaceId: payload.workspaceId
      }
    });

    const doc = await prisma.teleprompterDoc.create({
      data: {
        workspaceId: payload.workspaceId,
        title: payload.title,
        orderIndex,
        createdById: userId
      },
      include: {
        sections: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    return ok(mapDoc(doc), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
