import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireManager } from "@/src/server/applications/access";
import { addMockApplicants, removeMockApplicants } from "@/src/server/applications/mock";

type Context = { params: Promise<{ roundId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    return ok({ added: await addMockApplicants(await requireManager(), roundId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { roundId } = await params;
    return ok({ removed: await removeMockApplicants(await requireManager(), roundId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
