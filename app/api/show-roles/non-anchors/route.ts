import { NextRequest, NextResponse } from "next/server";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { nonAnchorsSaveSchema } from "@/src/server/show-roles-save";

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

  const parsed = nonAnchorsSaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Invalid save request. Reload the page and try again." }, 400);
  }
  const add = [...new Set(parsed.data.add)];
  const remove = parsed.data.remove.filter((name) => !add.includes(name));

  try {
    // Only the names this tab toggled change; a stale list can't erase anyone else's.
    const records = await prisma.$transaction(async (tx) => {
      if (remove.length > 0) {
        await tx.showRolesNonAnchor.deleteMany({ where: { name: { in: remove } } });
      }
      for (const name of add) {
        await tx.showRolesNonAnchor.upsert({
          where: { name },
          create: { name },
          update: {}
        });
      }
      return tx.showRolesNonAnchor.findMany({ orderBy: { name: "asc" } });
    });

    return json({ success: true, nonAnchors: records.map((record) => record.name) });
  } catch (error) {
    console.error("Show roles non-anchors POST failed:", error);
    return json({ error: "Internal server error" }, 500);
  }
}
