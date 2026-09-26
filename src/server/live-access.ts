import { getSessionUser, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { canManageLivestreams } from "@/src/server/livestream-access";
import { livestreamPinAllowsAccess } from "@/src/server/livestream-pin";

export type LiveAccess =
  | { kind: "user"; userId: string }
  | { kind: "pin" }
  | { kind: "none"; signedIn: boolean };

/**
 * Who may run the livestream dashboard: producers and appointed livestream managers when
 * signed in, or anyone holding today's dashboard PIN cookie.
 */
export async function getLiveAccess(): Promise<LiveAccess> {
  const session = await getSessionUser();
  if (session?.userId) {
    try {
      const user = await syncUserProfile(session.userId);
      const access = await getPlatformAccess(user.email);
      if (await canManageLivestreams(user.id, access.role)) {
        return { kind: "user", userId: user.id };
      }
    } catch {
      // An account that fails the platform check can still use the PIN.
    }
  }
  if (await livestreamPinAllowsAccess()) return { kind: "pin" };
  return { kind: "none", signedIn: Boolean(session?.userId) };
}

export async function requireLiveAccess() {
  const access = await getLiveAccess();
  if (access.kind === "none") throw new Error(access.signedIn ? "FORBIDDEN" : "UNAUTHORIZED");
  return access;
}

/** Settings → Livestream dashboard PIN: signed-in producers and managers only (never a PIN session). */
export async function requireLivestreamPinViewer() {
  const session = await getSessionUser();
  if (!session?.userId) throw new Error("UNAUTHORIZED");
  const user = await syncUserProfile(session.userId);
  const access = await getPlatformAccess(user.email);
  if (!(await canManageLivestreams(user.id, access.role))) throw new Error("FORBIDDEN");
  return user;
}
