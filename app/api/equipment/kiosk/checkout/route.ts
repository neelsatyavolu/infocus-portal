import { cookies } from "next/headers";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { EQUIPMENT_STATION_COOKIE_NAME } from "@/src/lib/equipment-kiosk";
import { ok } from "@/src/lib/http";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { kioskCheckout, kioskCheckoutBatch } from "@/src/server/equipment-kiosk";

const bodySchema = z.union([
  z.object({
    studentName: z.string().trim().min(1).max(200),
    studentEmail: z.string().trim().email().max(254).toLowerCase(),
    barcodes: z.array(z.string().trim().min(1)).min(1).max(50),
    tookSdCard: z.boolean().default(false)
  }),
  z.object({
    studentName: z.string().trim().min(1).max(200),
    studentEmail: z.string().trim().email().max(254).toLowerCase(),
    barcode: z.string().trim().min(1)
  })
]);

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "equipment:kiosk:checkout"), {
      max: 40,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const store = await cookies();
    const stationToken = store.get(EQUIPMENT_STATION_COOKIE_NAME)?.value;
    if (!stationToken) {
      throw new Error("UNAUTHORIZED");
    }

    const body = bodySchema.parse(await request.json());
    const result = "barcodes" in body
      ? await kioskCheckoutBatch({ stationToken, ...body })
      : await kioskCheckout({
          stationToken,
          studentName: body.studentName,
          studentEmail: body.studentEmail,
          barcode: body.barcode
        });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
