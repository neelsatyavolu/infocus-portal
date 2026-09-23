import { cookies } from "next/headers";
import { handleRouteError } from "@/src/lib/api-errors";
import { EQUIPMENT_STATION_COOKIE_NAME } from "@/src/lib/equipment-kiosk";
import { ok } from "@/src/lib/http";
import { listKioskItems } from "@/src/server/equipment-kiosk";

export async function GET() {
  try {
    const store = await cookies();
    const items = await listKioskItems(store.get(EQUIPMENT_STATION_COOKIE_NAME)?.value);
    return ok({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}
