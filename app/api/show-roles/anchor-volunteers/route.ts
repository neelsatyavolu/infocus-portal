import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const payloadSchema = z.object({
  monthKey: z.string().regex(MONTH_KEY_PATTERN),
  name: z.string().min(1).max(120)
});

async function requireProducer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);

  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET(request: Request) {
  try {
    await requireProducer();

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("monthKey");

    const volunteers = await prisma.anchorVolunteer.findMany({
      where: monthKey && MONTH_KEY_PATTERN.test(monthKey) ? { monthKey } : {},
      orderBy: [{ monthKey: "desc" }, { name: "asc" }]
    });

    return ok(
      volunteers.map((entry) => ({
        monthKey: entry.monthKey,
        name: entry.name
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireProducer();

    const payload = payloadSchema.parse(await request.json());

    await prisma.anchorVolunteer.upsert({
      where: { monthKey_name: { monthKey: payload.monthKey, name: payload.name } },
      update: {},
      create: { monthKey: payload.monthKey, name: payload.name }
    });

    return ok({ saved: true }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireProducer();

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("monthKey");
    const name = searchParams.get("name");

    if (!monthKey || !name || !MONTH_KEY_PATTERN.test(monthKey)) {
      throw new Error("BAD_REQUEST");
    }

    await prisma.anchorVolunteer.deleteMany({ where: { monthKey, name } });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
