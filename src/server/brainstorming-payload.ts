import type { PackageCategory } from "@prisma/client";
import { getPlatformAccess, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { loadStudentBrainstormPackages } from "@/src/server/package-brainstorm";
import { resolveStudentCycleNumber } from "@/src/server/package-cycle-stage";
import { ensurePackageProgressDefaults } from "@/src/server/package-progress-data";

/**
 * GET /api/brainstorming's answer, also loaded by the /brainstorming page for its first paint.
 * The role and the cycles load together; the producer's category (associates only) and the
 * student's cycle then load together, reusing those cycles instead of reading them again.
 */
export async function loadBrainstormingPayload(input: {
  userId: string;
  email: string | null;
  requestedCycleNumber: number | null;
}) {
  const [access, cycles] = await Promise.all([getPlatformAccess(input.email), ensurePackageProgressDefaults()]);
  const [activeCycleNumber, producerCategory] = await Promise.all([
    input.requestedCycleNumber ?? resolveStudentCycleNumber(input.userId, null, cycles),
    access.role === "ASSOCIATE_PRODUCER" ? loadProducerCategory(input.email) : null
  ]);

  const packages = await loadStudentBrainstormPackages(input.userId, activeCycleNumber, {
    platformRole: access.role,
    producerCategory
  });

  return {
    currentUserId: input.userId,
    canApprove: false,
    activeCycleNumber,
    cycles: cycles.map((cycle) => ({
      cycleNumber: cycle.cycleNumber,
      focus: cycle.focus
    })),
    packages
  };
}

async function loadProducerCategory(email: string | null): Promise<PackageCategory | null> {
  const assignment = await prisma.platformRoleAssignment.findUnique({
    where: { email: normalizeEmail(email) },
    select: { category: true }
  });
  return assignment?.category ?? null;
}
