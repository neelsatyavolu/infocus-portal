import { type PackageCategory, PlatformRole } from "@prisma/client";
import { cache } from "react";
import { ASSOCIATE_REVIEW_AUDIT } from "@/src/server/associate-review-history";
import { prisma } from "@/src/lib/prisma";
import { remainingFromApproval } from "@/src/lib/package-approval";
import { approvedExtensionDaysFor, groupWideExtension } from "@/src/lib/package-extensions";
import { finalCutDeadlinePassed } from "@/src/lib/deadlines";
import { gradersDoneWithGroup } from "@/src/lib/package-final-cut-scores";
import { membersAwaitingFinalCutScores } from "@/src/lib/package-revisions";
import { currentCutRevisionStage } from "@/src/lib/initial-cut-review-versions";
import { APPROVAL_COMMENT_PREFIX } from "@/src/lib/package-stage-comments";
import { aRollFeedbackNeedsChanges } from "@/src/lib/package-stage-status";
import { serializeProofs } from "@/src/lib/package-brainstorm";
import { previousTeammatesByUserFromGroups } from "@/src/lib/consecutive-groupmates";
import { normalizeEmail, PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";
import { getCycleNumbers } from "@/src/server/program-settings";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";

export function buildMissingProgressRows(cycleNumbers: number[]) {
  return cycleNumbers.flatMap((cycleNumber) =>
    Array.from({ length: 10 }, (_, index) => ({
      cycleNumber,
      rowOrder: index,
      groupMembers: "",
      groupTopic: "",
      groupType: "",
      assignedProducerUserId: null as string | null,
      assignedExecutiveProducerUserId: null as string | null,
      pitching: false,
      proofOfContact: false,
      aRollBRoll: false,
      initialCut: false,
      finalCut: false,
      extension: false,
      possibleInterviews: "",
      possibleIdeas: "",
      notes: ""
    }))
  );
}

type AssignableUser = {
  userId: string;
  name: string | null;
  email: string | null;
  category: PackageCategory | null;
};

async function loadAssignableByRole(role: PlatformRole): Promise<AssignableUser[]> {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { role },
    select: { email: true, category: true }
  });

  const emailToMeta = new Map(
    assignments.map((entry) => [normalizeEmail(entry.email), entry] as const)
  );
  const emails = [...emailToMeta.keys()].filter(Boolean);
  if (emails.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      email: { in: emails, mode: "insensitive" }
    },
    select: { id: true, name: true, nickname: true, email: true }
  });

  return mergeAssignableUsers(
    users.map((user) => {
      const meta = emailToMeta.get(normalizeEmail(user.email));
      return {
        userId: user.id,
        name: userDisplayName(user) || user.name,
        email: user.email,
        category: meta?.category ?? null
      };
    })
  );
}

export function mergeAssignableUsers(...lists: AssignableUser[][]): AssignableUser[] {
  const seen = new Set<string>();
  const merged: AssignableUser[] = [];
  for (const list of lists) {
    for (const user of list) {
      if (seen.has(user.userId)) continue;
      seen.add(user.userId);
      merged.push(user);
    }
  }
  return merged.sort((a, b) => {
    const aLabel = userDisplayName(a).toLowerCase();
    const bLabel = userDisplayName(b).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

function mapAssignedUser(
  user: { id: string; name: string | null; nickname?: string | null; email: string | null } | null
) {
  return user ? { userId: user.id, ...labeledUser(user) } : null;
}

/** Users who can be assigned as a group's associate producer. */
export async function loadAssignableProducers() {
  return loadAssignableByRole(PlatformRole.ASSOCIATE_PRODUCER);
}

/** Users with the executive producer role, without the super-admin fallback. */
export async function loadExecutiveProducerRoleUsers() {
  return loadAssignableByRole(PlatformRole.EXECUTIVE_PRODUCER);
}

async function loadSuperAdminAssignable(): Promise<AssignableUser[]> {
  if (!PLATFORM_SUPER_ADMIN_EMAIL) return [];
  const user = await prisma.user.findFirst({
    where: { email: { equals: PLATFORM_SUPER_ADMIN_EMAIL, mode: "insensitive" } },
    select: { id: true, name: true, nickname: true, email: true }
  });
  if (!user) return [];
  return [{ userId: user.id, name: userDisplayName(user) || user.name, email: user.email, category: null }];
}

/** Users who can be assigned as a group's executive producer. */
export async function loadAssignableExecutiveProducers() {
  const [executives, superAdmin] = await Promise.all([
    loadAssignableByRole(PlatformRole.EXECUTIVE_PRODUCER),
    loadSuperAdminAssignable()
  ]);
  return mergeAssignableUsers(executives, superAdmin);
}

/** Executive producers and the super-admin each enter a final-cut score. */
export async function loadRequiredFinalCutGraders() {
  return loadAssignableExecutiveProducers();
}

const CYCLE_SELECT = {
  cycleNumber: true,
  focus: true,
  pitchingDate: true,
  proofOfContactDate: true,
  aRollBRollDate: true,
  initialCutDate: true,
  finalCutDate: true
} as const;

function loadCycles() {
  return prisma.packageCycle.findMany({ orderBy: { cycleNumber: "asc" }, select: CYCLE_SELECT });
}

/** Cycle numbers that already have progress rows (GROUP BY in SQL, not every row). */
async function loadProgressRowCycleNumbers() {
  const groups = await prisma.packageProgressRow.groupBy({ by: ["cycleNumber"] });
  return new Set(groups.map((group) => group.cycleNumber));
}

/** Cycle numbers in `wanted` that are not in `existing`. */
export function missingCycleNumbers(wanted: number[], existing: Set<number>) {
  return wanted.filter((cycleNumber) => !existing.has(cycleNumber));
}

async function ensureDefaultCycles(
  cycleNumbers: number[],
  existing: Awaited<ReturnType<typeof loadCycles>>
) {
  const missing = missingCycleNumbers(cycleNumbers, new Set(existing.map((cycle) => cycle.cycleNumber)));
  if (missing.length === 0) {
    return existing;
  }

  await prisma.packageCycle.createMany({
    data: missing.map((cycleNumber) => ({
      cycleNumber,
      focus: ""
    }))
  });

  return loadCycles();
}

async function ensureDefaultProgressRows(cycleNumbers: number[], existing: Set<number>) {
  const missing = missingCycleNumbers(cycleNumbers, existing);
  if (missing.length === 0) {
    return;
  }

  await prisma.packageProgressRow.createMany({
    data: buildMissingProgressRows(missing)
  });
}

/**
 * Makes sure every configured cycle has a PackageCycle and default rows, and returns the cycles.
 * The settings read and both existence checks run in parallel; writes only happen when missing.
 * Deduped per server render via React cache().
 */
export const ensurePackageProgressDefaults = cache(async function ensurePackageProgressDefaults() {
  const [cycleNumbers, existingCycles, rowCycleNumbers] = await Promise.all([
    getCycleNumbers(),
    loadCycles(),
    loadProgressRowCycleNumbers()
  ]);
  // Independent tables (PackageProgressRow.cycleNumber has no FK to PackageCycle).
  const [cycles] = await Promise.all([
    ensureDefaultCycles(cycleNumbers, existingCycles),
    ensureDefaultProgressRows(cycleNumbers, rowCycleNumbers)
  ]);
  return cycles;
});

/** The first cycle whose Final Cut is still open, else the last cycle (cycles sorted ascending). */
export function activeCycleNumberFor(
  cycles: ReadonlyArray<{ cycleNumber: number; finalCutDate: Date | null }>,
  now: Date = new Date()
) {
  return (
    cycles.find((cycle) => !finalCutDeadlinePassed(cycle.finalCutDate, now))?.cycleNumber ??
    cycles[cycles.length - 1]?.cycleNumber ??
    1
  );
}

export async function loadPackageProgressData(requestedCycleNumber?: number | null) {
  const cycles = await ensurePackageProgressDefaults();

  const activeCycleNumber = requestedCycleNumber ?? activeCycleNumberFor(cycles);

  const [rows, producers, executives, previousCycleRows, finalCutGrades] = await Promise.all([
    prisma.packageProgressRow.findMany({
      where: { cycleNumber: activeCycleNumber },
      orderBy: { rowOrder: "asc" },
      include: {
        members: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, nickname: true, email: true } }
          }
        },
        assignedProducer: {
          select: { id: true, name: true, nickname: true, email: true }
        },
        assignedExecutiveProducer: {
          select: { id: true, name: true, nickname: true, email: true }
        },
        proofOfContacts: {
          select: { id: true, slot: true, fileName: true, mimeType: true }
        },
        approval: {
          select: {
            stage: true,
            controversial: true,
            signoffs: { select: { userId: true, stage: true, approved: true, mediaItemId: true, createdAt: true } }
          }
        },
        initialCutMediaItem: {
          select: { currentVersion: { select: { id: true, createdAt: true, versionNumber: true, approvalStatus: true } } }
        },
        finalCutMediaItem: { select: { createdAt: true } },
        stageMedia: {
          where: { stage: "a-roll" },
          select: { id: true, createdAt: true, mediaItem: { select: { currentVersionId: true } } },
          orderBy: { createdAt: "desc" },
          take: 1
        },
        stageComments: {
          where: { stage: "a-roll", NOT: { body: { startsWith: APPROVAL_COMMENT_PREFIX } } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1
        },
        finalCutScores: {
          select: { graderUserId: true, memberUserId: true, points: true, qualityPoints: true, effortPoints: true }
        },
        extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } }
      }
    }),
    loadAssignableProducers(),
    loadAssignableExecutiveProducers(),
    activeCycleNumber > 1
      ? prisma.packageProgressRow.findMany({
          where: { cycleNumber: activeCycleNumber - 1 },
          select: { members: { select: { userId: true } } }
        })
      : Promise.resolve([]),
    prisma.packageGrade.findMany({
      where: { cycleNumber: activeCycleNumber, awardedFinalCutPoints: { not: null } },
      select: { userId: true, awardedFinalCutPoints: true, revisionCount: true, publishedAt: true }
    })
  ]);

  const readiness = rows.length ? await prisma.auditLog.findMany({
    where: {
      action: ASSOCIATE_REVIEW_AUDIT,
      targetType: "PackageProgressRow",
      targetId: { in: rows.map((row) => row.id) },
      metadata: { path: ["kind"], equals: "ready" }
    },
    select: { targetId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" }
  }) : [];
  const readyAt = new Map<string, Date>();
  for (const event of readiness) {
    const meta = event.metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const key = `${event.targetId}:${meta.stage === "brainstorming" ? meta.stage : meta.mediaVersionId}`;
    if (!readyAt.has(key)) readyAt.set(key, event.createdAt);
  }

  const officiallyGraded = new Set(finalCutGrades.map((grade) => grade.userId));
  const gradedAndPublished = new Set(
    finalCutGrades.filter((grade) => grade.publishedAt).map((grade) => grade.userId)
  );

  const previousTeammatesByUser = previousTeammatesByUserFromGroups(
    previousCycleRows.map((row) => row.members.map((member) => member.userId))
  );

  return {
    activeCycleNumber,
    cycles: cycles.map((cycle) => ({
      cycleNumber: cycle.cycleNumber,
      focus: cycle.focus,
      dates: {
        pitching: cycle.pitchingDate?.toISOString() ?? null,
        proofOfContact: cycle.proofOfContactDate?.toISOString() ?? null,
        aRollBRoll: cycle.aRollBRollDate?.toISOString() ?? null,
        initialCut: cycle.initialCutDate?.toISOString() ?? null,
        finalCut: cycle.finalCutDate?.toISOString() ?? null
      }
    })),
    producers,
    executives,
    previousTeammatesByUser,
    rows: rows.map((row) => ({
      id: row.id,
      reviewReadyAt: {
        brainstorming: readyAt.get(`${row.id}:brainstorming`)?.toISOString() ?? null,
        "a-roll": (readyAt.get(`${row.id}:${row.stageMedia[0]?.mediaItem.currentVersionId}`) ?? row.stageMedia[0]?.createdAt)?.toISOString() ?? null,
        "initial-cut": (readyAt.get(`${row.id}:${row.initialCutMediaItem?.currentVersion?.id}`)
          ?? row.initialCutMediaItem?.currentVersion?.createdAt)?.toISOString() ?? null
      },
      groupMembers: row.groupMembers,
      groupTopic: row.groupTopic,
      groupType: row.groupType,
      category: row.category,
      assignedProducerUserId: row.assignedProducerUserId,
      assignedProducer: mapAssignedUser(row.assignedProducer),
      assignedExecutiveProducerUserId: row.assignedExecutiveProducerUserId,
      assignedExecutiveProducer: mapAssignedUser(row.assignedExecutiveProducer),
      memberUserIds: row.members.map((member) => member.userId),
      members: row.members.map((member) => ({
        userId: member.userId,
        ...labeledUser(member.user)
      })),
      projectId: row.projectId,
      initialCutMediaItemId: row.initialCutMediaItemId,
      finalCutMediaItemId: row.finalCutMediaItemId,
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      initialCut: row.initialCut,
      initialCutManual: row.initialCutManual,
      revisedInitialCut: row.revisedInitialCut,
      finalCut: row.finalCut,
      finalCutManual: row.finalCutManual,
      extension: row.extension,
      extensionDays: approvedExtensionDaysFor(row),
      groupWideExtension: groupWideExtension(row),
      possibleInterviews: row.possibleInterviews,
      possibleIdeas: row.possibleIdeas,
      notes: row.notes,
      stageNotes: (row.stageNotes as Record<string, string> | null) ?? null,
      brainstormDocUrl: row.brainstormDocUrl,
      proofs: serializeProofs(row.proofOfContacts),
      approvalStage: row.approval?.stage ?? "DRAFT",
      remainingExecutiveSignoffs: remainingFromApproval(row.approval),
      awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
      initialCutVersionNumber: row.initialCutMediaItem?.currentVersion?.versionNumber ?? null,
      initialCutNeedsRevisions: row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
      initialCutReviewStage: currentCutRevisionStage(
        row.initialCutMediaItemId && row.initialCutMediaItem?.currentVersion
          ? { mediaItemId: row.initialCutMediaItemId, createdAt: row.initialCutMediaItem.currentVersion.createdAt }
          : null,
        row.approval?.signoffs ?? []
      ),
      aRollHasMedia: row.stageMedia.length > 0,
      aRollNeedsChanges: aRollFeedbackNeedsChanges(
        row.aRollBRoll,
        row.stageComments.length > 0,
        row.stageComments[0]?.createdAt,
        row.stageMedia[0]?.createdAt
      ),
      queuedForAir: Boolean(row.queuedForAirAt),
      // Every member has an official Final Cut grade.
      finalCutGraded:
        Boolean(row.finalCutMediaItemId) &&
        row.members.length > 0 &&
        row.members.every((member) => officiallyGraded.has(member.userId)),
      // Every member's graded cycle grade is published.
      finalCutGradesPublished:
        Boolean(row.finalCutMediaItemId) &&
        row.members.length > 0 &&
        row.members.every((member) => gradedAndPublished.has(member.userId)),
      finalCutSubmittedAt: row.finalCutMediaItem?.createdAt.toISOString() ?? null,
      packageOfCycleAt: row.packageOfCycleAt?.toISOString() ?? null,
      finalCutScoredByUserIds: gradersDoneWithGroup(
        row.finalCutScores,
        membersAwaitingFinalCutScores(
          row.members.map((member) => member.userId),
          row.finalCutScores,
          finalCutGrades
        )
      )
    }))
  };
}
