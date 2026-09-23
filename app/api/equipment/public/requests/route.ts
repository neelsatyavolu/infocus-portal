import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { createPublicRequest } from "@/src/server/equipment-requests";

const bodySchema = z.object({
  studentName: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
  email: z.string().trim().min(1),
  barcodes: z.array(z.string().trim().min(1)).min(1)
});

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "equipment:public:requests"), {
      max: 40,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const body = bodySchema.parse(await request.json());
    const created = await createPublicRequest(body);
    return ok(created, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
