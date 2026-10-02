import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import {
  nativeDeviceDeleteSchema,
  nativeDeviceSchema,
  registerNativePushDevice,
  removeNativePushDevice,
  requireRealUserId
} from "@/src/server/native-push-devices";

/** The InFocus Mac and iPhone apps register their Apple Push token here after sign-in. */
export async function POST(request: Request) {
  try {
    const userId = await requireRealUserId();
    const payload = nativeDeviceSchema.parse(await request.json().catch(() => null));
    await registerNativePushDevice(userId, payload);
    return ok({ registered: true }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Sign-out in an app: stop notifying that device. */
export async function DELETE(request: Request) {
  try {
    const userId = await requireRealUserId();
    const payload = nativeDeviceDeleteSchema.parse(await request.json().catch(() => null));
    const removed = await removeNativePushDevice(userId, payload.token);
    return ok({ removed: removed > 0 });
  } catch (error) {
    return handleRouteError(error);
  }
}
