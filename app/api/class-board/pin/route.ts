import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { currentClassBoardPin, issueClassBoardPin, requireClassBoardPinAdmin } from "@/src/server/class-board-pin";

export async function GET() {
  try {
    await requireClassBoardPinAdmin();
    const pin = await currentClassBoardPin();
    return ok({ pin });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  try {
    await requireClassBoardPinAdmin();
    const pin = await issueClassBoardPin();
    return ok({ pin });
  } catch (error) {
    return handleRouteError(error);
  }
}
