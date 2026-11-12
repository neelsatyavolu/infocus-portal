import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import {
  AnchorRequestError,
  cancelAnchorSlotRequest,
  createAnchorSlotRequest,
  decideAnchorSlotRequest,
  listAnchorSlotRequests
} from "@/src/server/anchor-slot-requests";

/**
 * Anchor drop / swap requests. Any signed-in anchor can ask (GET, POST) and cancel their own
 * (PATCH cancel); approving and denying needs the same access as editing show roles.
 */

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DROP"),
    showDate: z.string().regex(DATE_KEY_PATTERN),
    reason: z.string().trim().max(500).default("")
  }),
  z.object({
    kind: z.literal("SWAP"),
    showDate: z.string().regex(DATE_KEY_PATTERN),
    swapWithUserId: z.string().trim().min(1).max(128),
    reason: z.string().trim().max(500).default("")
  })
]);

const patchSchema = z.object({
  id: z.string().trim().min(1).max(64),
  action: z.enum(["approve", "deny", "cancel"])
});

async function viewer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  return { userId, canDecide: hasPlatformRole(access.role, "ASSOCIATE_PRODUCER") };
}

function routeError(error: unknown) {
  if (error instanceof AnchorRequestError) return fail(error.message, error.status);
  return handleRouteError(error);
}

export async function GET(request: Request) {
  try {
    const { userId, canDecide } = await viewer();
    const date = new URL(request.url).searchParams.get("date");
    if (date && !DATE_KEY_PATTERN.test(date)) {
      return fail("A valid date is required.", 400);
    }
    return ok(await listAnchorSlotRequests({ viewerId: userId, canDecide, showDate: date ?? undefined }));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await viewer();
    const payload = createSchema.parse(await request.json());
    const created = await createAnchorSlotRequest({
      userId,
      showDate: payload.showDate,
      kind: payload.kind,
      swapWithUserId: payload.kind === "SWAP" ? payload.swapWithUserId : null,
      reason: payload.reason
    });
    return ok({ id: created.id, lateNotice: created.lateNotice, status: created.status }, 201);
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId, canDecide } = await viewer();
    const payload = patchSchema.parse(await request.json());
    if (payload.action === "cancel") {
      await cancelAnchorSlotRequest(payload.id, userId);
      return ok({ id: payload.id, status: "CANCELLED" });
    }
    if (!canDecide) {
      return fail("Forbidden", 403);
    }
    const decided = await decideAnchorSlotRequest({ id: payload.id, deciderId: userId, approve: payload.action === "approve" });
    return ok({ id: decided.id, status: decided.status });
  } catch (error) {
    return routeError(error);
  }
}
