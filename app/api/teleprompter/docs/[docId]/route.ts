import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireTeleprompterActor, requireTeleprompterDocAccess } from "@/src/server/teleprompter-access";

const updateDocSchema = z.object({
  title: z.string().trim().min(1).max(140)
});

function mapDoc(doc: {
  id: string;
  title: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: doc.id,
    title: doc.title,
    orderIndex: doc.orderIndex,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const payload = updateDocSchema.parse(await request.json());
    const { docId } = await params;
    const { userId, email } = await requireTeleprompterActor();

    await requireTeleprompterDocAccess({
      docId,
      userId,
      email
    });

    const updated = await prisma.teleprompterDoc.update({
      where: {
        id: docId
      },
      data: {
        title: payload.title
      }
    });

    return ok(mapDoc(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
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

    await prisma.teleprompterDoc.delete({
      where: {
        id: docId
      }
    });

    return ok({
      id: docId
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
