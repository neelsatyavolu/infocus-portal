import { handleRouteError } from "@/src/lib/api-errors";
import { okNoStore } from "@/src/lib/http";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireLivestreamPinViewer } from "@/src/server/live-access";
import { currentLivestreamPin, issueLivestreamPin } from "@/src/server/livestream-pin";

export async function GET() {
  try {
    await requireLivestreamPinViewer();
    return okNoStore({ pin: await currentLivestreamPin() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireLivestreamPinViewer();
    const limit = limitByKey(getRequestKey(request, "livestream-pin:rotate"), { max: 10, windowMs: 60_000 });
    if (!limit.allowed) throw new Error("TOO_MANY_REQUESTS");
    return okNoStore({ pin: await issueLivestreamPin() });
  } catch (error) {
    return handleRouteError(error);
  }
}
