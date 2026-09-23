import { cookies } from "next/headers";
import { EQUIPMENT_STATION_COOKIE_NAME } from "@/src/lib/equipment-kiosk";
import { requireEquipmentStation } from "@/src/server/equipment-station";
import { ok } from "@/src/lib/http";
import { handleRouteError } from "@/src/lib/api-errors";
export async function GET() {
  try {
    const store = await cookies();
    const session = await requireEquipmentStation(store.get(EQUIPMENT_STATION_COOKIE_NAME)?.value);
    return ok({ unlocked: true, expiresAt: session.expiresAt, remainingMs: Math.max(0, session.expiresAt - Date.now()) });
  } catch (error) {
    if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message)) return ok({ unlocked: false });
    return handleRouteError(error);
  }
}
