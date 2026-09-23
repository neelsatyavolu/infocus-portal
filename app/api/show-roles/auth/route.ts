import { NextResponse } from "next/server";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      return json({ authenticated: false, error: "Forbidden" }, 403);
    }
    return json({ authenticated: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return json({ authenticated: false, error: "Forbidden" }, 403);
    }

    return json({ authenticated: false, error: "Unauthorized" }, 401);
  }
}

export async function POST() {
  return json({ error: "Use platform sign-in at /sign-in." }, 405);
}

export async function DELETE() {
  return json({ error: "Use /api/auth/sign-out to end your session." }, 405);
}
