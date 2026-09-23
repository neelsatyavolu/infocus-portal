import { cookies } from "next/headers";
import { handleRouteError } from "@/src/lib/api-errors";
import { EQUIPMENT_STATION_COOKIE_NAME, getEquipmentStationCookieMeta } from "@/src/lib/equipment-kiosk";
import { ok } from "@/src/lib/http";

export async function POST(request: Request) {
  try {
    const store = await cookies();
    store.set(EQUIPMENT_STATION_COOKIE_NAME, "", { ...getEquipmentStationCookieMeta(new URL(request.url).host), maxAge: 0 });
    return ok({ locked: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
