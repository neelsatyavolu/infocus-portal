import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import {
  calculateExtensionDays,
  effectiveAppliedDays,
  getAdminEmailSet,
  isAdminUserEmail,
  sanitizeFreeExtensionDays,
  STARTING_EXTENSION_DAYS,
  toDateKey
} from "@/src/lib/extensions";
import { ok } from "@/src/lib/http";
import { PACKAGE_CYCLE_NUMBERS } from "@/src/lib/package-grades";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

const updateUsageSchema = z.object({
  action: z.literal("updateUsage"),
  userId: z.string().min(1),
  cycleNumber: z.number().int().min(1).max(4),
  appliedDays: z.number().int().min(0),
  exempt: z.boolean()
});

async function ensureDefaultCycles() {
  const existing = await prisma.packageCycle.findMany({
    select: { cycleNumber: true }
  });

  const existingSet = new Set(existing.map((entry) => entry.cycleNumber));
  const missing = PACKAGE_CYCLE_NUMBERS.filter((cycleNumber) => !existingSet.has(cycleNumber));

  if (missing.length > 0) {
    await prisma.packageCycle.createMany({
      data: missing.map((cycleNumber) => ({
        cycleNumber,
        focus: ""
      }))
    });
  }
}

type ExtensionCycleDetail = {
  cycleNumber: number;
  focus: string;
  finalCutDate: string | null;
  turnedInDate: string | null;
  calculatedDays: number;
  appliedDays: number;
  freeDays: number;
  exempt: boolean;
  effectiveAppliedDays: number;
};

type ExtensionUserDetail = {
  userId: string;
  name: string | null;
  email: string | null;
  usedDays: number;
  remainingDays: number;
  cycles: ExtensionCycleDetail[];
};

async function buildExtensionsPayload() {
  const [adminEmails, users, cycles, grades] = await Promise.all([
    getAdminEmailSet(),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true
      }
    }),
    prisma.packageCycle.findMany({
      orderBy: { cycleNumber: "asc" },
      select: {
        cycleNumber: true,
        focus: true,
        finalCutDate: true
      }
    }),
    prisma.packageGrade.findMany({
      select: {
        userId: true,
        cycleNumber: true,
        turnedInDate: true,
        extensionDaysApplied: true,
        freeExtensionDays: true,
        extensionExempt: true
      }
    })
  ]);

  const gradableUsers = users
    .filter((entry) => !isAdminUserEmail(entry.email, adminEmails))
    .sort((a, b) => {
      const aKey = (a.name ?? a.email ?? "").toLowerCase();
      const bKey = (b.name ?? b.email ?? "").toLowerCase();
      return aKey.localeCompare(bKey);
    });

  const gradeMap = new Map(grades.map((entry) => [`${entry.userId}:${entry.cycleNumber}`, entry]));

  const userDetails: ExtensionUserDetail[] = gradableUsers.map((user) => {
    const cycleDetails = cycles.map((cycle) => {
      const grade = gradeMap.get(`${user.id}:${cycle.cycleNumber}`);
      const calculatedDays = calculateExtensionDays(cycle.finalCutDate, grade?.turnedInDate ?? null);
      const appliedDays = Math.max(0, grade?.extensionDaysApplied ?? 0);
      const freeDays = sanitizeFreeExtensionDays(grade?.freeExtensionDays ?? 0);
      const exempt = Boolean(grade?.extensionExempt);
      const effectiveApplied = effectiveAppliedDays({
        extensionDaysApplied: appliedDays,
        freeExtensionDays: freeDays,
        extensionExempt: exempt
      });

      return {
        cycleNumber: cycle.cycleNumber,
        focus: cycle.focus,
        finalCutDate: toDateKey(cycle.finalCutDate),
        turnedInDate: toDateKey(grade?.turnedInDate ?? null),
        calculatedDays,
        appliedDays,
        freeDays,
        exempt,
        effectiveAppliedDays: effectiveApplied
      };
    });

    const usedDays = cycleDetails.reduce((sum, cycle) => sum + cycle.effectiveAppliedDays, 0);
    return {
      userId: user.id,
      name: userDisplayName(user) || user.name,
      email: user.email,
      usedDays,
      remainingDays: STARTING_EXTENSION_DAYS - usedDays,
      cycles: cycleDetails
    };
  });

  return {
    startingDays: STARTING_EXTENSION_DAYS,
    users: userDetails
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    await ensureDefaultCycles();
    return ok(await buildExtensionsPayload());
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

    const payload = updateUsageSchema.parse(await request.json());
    const adminEmails = await getAdminEmailSet();
    const targetUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true
      }
    });

    if (!targetUser) {
      throw new Error("NOT_FOUND");
    }

    if (isAdminUserEmail(targetUser.email, adminEmails)) {
      throw new Error("FORBIDDEN");
    }

    await prisma.packageGrade.upsert({
      where: {
        cycleNumber_userId: {
          cycleNumber: payload.cycleNumber,
          userId: payload.userId
        }
      },
      update: {
        extensionDaysApplied: payload.appliedDays,
        extensionExempt: payload.exempt
      },
      create: {
        cycleNumber: payload.cycleNumber,
        userId: payload.userId,
        effortPoints: 0,
        teamworkPoints: 0,
        feedback: "",
        turnedInDate: null,
        extensionDaysApplied: payload.appliedDays,
        extensionExempt: payload.exempt,
        publishedAt: null
      }
    });

    return ok(await buildExtensionsPayload());
  } catch (error) {
    return handleRouteError(error);
  }
}
