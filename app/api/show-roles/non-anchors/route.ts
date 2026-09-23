import { NextRequest, NextResponse } from "next/server";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function assertShowRolesAccess() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      return json({ error: "Forbidden" }, 403);
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return json({ error: "Forbidden" }, 403);
    }

    return json({ error: "Unauthorized" }, 401);
  }
}

export async function GET() {
  const accessError = await assertShowRolesAccess();
  if (accessError) {
    return accessError;
  }

  try {
    const records = await prisma.showRolesNonAnchor.findMany({
      orderBy: { name: "asc" }
    });

    return json({ nonAnchors: records.map((r) => r.name) });
  } catch (error) {
    console.error("Show roles non-anchors GET failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
}

export async function POST(request: NextRequest) {
  const accessError = await assertShowRolesAccess();
  if (accessError) {
    return accessError;
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray((body as { nonAnchors?: unknown[] }).nonAnchors)) {
    return json({ error: "Invalid data format. Expected { nonAnchors: string[] }." }, 400);
  }

  const incoming = (body as { nonAnchors: unknown[] }).nonAnchors
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.showRolesNonAnchor.deleteMany({
        where: incoming.length > 0 ? { name: { notIn: incoming } } : undefined
      });

      for (const name of incoming) {
        await tx.showRolesNonAnchor.upsert({
          where: { name },
          create: { name },
          update: {}
        });
      }
    });

    return json({ success: true, nonAnchors: incoming });
  } catch (error) {
    console.error("Show roles non-anchors POST failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
}
