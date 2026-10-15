import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  MAX_CYCLES_PER_SEMESTER,
  MIN_CYCLES_PER_SEMESTER,
  assertValidCycleNumber
} from "@/src/server/program-settings";
import { ensureDefaultCycles, loadPackageCycles, toDateKey } from "@/src/server/package-cycles-data";

const payloadSchema = z.object({
  cycleNumber: z.number().int().min(MIN_CYCLES_PER_SEMESTER).max(MAX_CYCLES_PER_SEMESTER),
  focus: z.string().max(180).optional(),
  pitchingDate: z.string().nullable().optional(),
  proofOfContactDate: z.string().nullable().optional(),
  aRollBRollDate: z.string().nullable().optional(),
  initialCutDate: z.string().nullable().optional(),
  finalCutDate: z.string().nullable().optional()
});

function parseDateInput(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new Error("BAD_REQUEST");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("BAD_REQUEST");
  }

  return parsed;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    return ok(await loadPackageCycles(access.role));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    await ensureDefaultCycles();

    const payload = payloadSchema.parse(await request.json());
    await assertValidCycleNumber(payload.cycleNumber);

    const updated = await prisma.packageCycle.upsert({
      where: {
        cycleNumber: payload.cycleNumber
      },
      create: {
        cycleNumber: payload.cycleNumber,
        focus: payload.focus?.trim() ?? "",
        pitchingDate: parseDateInput(payload.pitchingDate),
        proofOfContactDate: parseDateInput(payload.proofOfContactDate),
        aRollBRollDate: parseDateInput(payload.aRollBRollDate),
        initialCutDate: parseDateInput(payload.initialCutDate),
        finalCutDate: parseDateInput(payload.finalCutDate)
      },
      update: {
        focus: payload.focus?.trim() ?? "",
        pitchingDate: parseDateInput(payload.pitchingDate),
        proofOfContactDate: parseDateInput(payload.proofOfContactDate),
        aRollBRollDate: parseDateInput(payload.aRollBRollDate),
        initialCutDate: parseDateInput(payload.initialCutDate),
        finalCutDate: parseDateInput(payload.finalCutDate)
      }
    });

    return ok({
      cycleNumber: updated.cycleNumber,
      focus: updated.focus,
      pitchingDate: toDateKey(updated.pitchingDate),
      proofOfContactDate: toDateKey(updated.proofOfContactDate),
      aRollBRollDate: toDateKey(updated.aRollBRollDate),
      initialCutDate: toDateKey(updated.initialCutDate),
      finalCutDate: toDateKey(updated.finalCutDate)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("Invalid cycle number or date format. Use YYYY-MM-DD for dates.", 400);
    }
    return handleRouteError(error);
  }
}
