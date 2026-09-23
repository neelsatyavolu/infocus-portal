import { PackageCategory } from "@prisma/client";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { canEditPackageCycle, getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { recomputeCycleCutStatus, resolveManualCutFlags } from "@/src/server/cycle-cut-status";
import {
  ensurePackageProgressDefaults,
  loadAssignableExecutiveProducers,
  loadAssignableProducers,
  loadPackageProgressData
} from "@/src/server/package-progress-data";
import { serializeProofs } from "@/src/lib/package-brainstorm";
import { labeledUser } from "@/src/lib/user-display";
import { PACKAGE_ROSTER_NOTE_MAX, nextPackageRosterNote } from "@/src/lib/package-roster-notes";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";
const TYPE_OPTIONS = ["News", "Feature", "Commentary", "Man on the Street", "Other"] as const;

const rowSchema = z.object({
  id: z.string().optional(),
  groupMembers: z.string().max(1000),
  groupTopic: z.string().max(280),
  groupType: z.union([z.enum(TYPE_OPTIONS), z.literal("")]),
  category: z.nativeEnum(PackageCategory).nullish(),
  assignedProducerUserId: z.string().nullish(),
  assignedExecutiveProducerUserId: z.string().nullish(),
  memberUserIds: z.array(z.string()).max(20).optional(),
  projectId: z.string().nullish(),
  initialCutMediaItemId: z.string().nullish(),
  finalCutMediaItemId: z.string().nullish(),
  pitching: z.boolean().optional(),
  proofOfContact: z.boolean(),
  aRollBRoll: z.boolean(),
  initialCut: z.boolean(),
  initialCutManual: z.boolean().optional(),
  revisedInitialCut: z.boolean().optional(),
  finalCut: z.boolean(),
  finalCutManual: z.boolean().optional(),
  extension: z.boolean(),
  possibleInterviews: z.string().max(PACKAGE_ROSTER_NOTE_MAX).optional(),
  possibleIdeas: z.string().max(PACKAGE_ROSTER_NOTE_MAX).optional(),
  notes: z.string().max(1200).optional(),
  stageNotes: z.record(z.string(), z.string().max(600)).nullish()
});

const payloadSchema = z.object({
  cycleNumber: z.number().int().min(1).max(MAX_CYCLES_PER_SEMESTER),
  rows: z.array(rowSchema).max(200)
});

function parseCycleNumber(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_CYCLES_PER_SEMESTER) {
    throw new Error("BAD_REQUEST");
  }
  return number;
}

function mapRowResponse(row: {
  id: string;
  groupMembers: string;
  groupTopic: string;
  groupType: string;
  category: PackageCategory | null;
  assignedProducerUserId: string | null;
  assignedProducer?: { id: string; name: string | null; nickname?: string | null; email: string | null } | null;
  assignedExecutiveProducerUserId: string | null;
  assignedExecutiveProducer?: { id: string; name: string | null; nickname?: string | null; email: string | null } | null;
  members: Array<{
    userId: string;
    user: { id: string; name: string | null; nickname?: string | null; email: string | null };
  }>;
  projectId: string | null;
  initialCutMediaItemId: string | null;
  finalCutMediaItemId: string | null;
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  initialCutManual: boolean;
  revisedInitialCut: boolean;
  finalCut: boolean;
  finalCutManual: boolean;
  extension: boolean;
  possibleInterviews: string;
  possibleIdeas: string;
  notes: string;
  stageNotes: unknown;
  brainstormDocUrl?: string;
  proofOfContacts?: Array<{ id: string; slot: number; fileName: string; mimeType: string }>;
}) {
  return {
    id: row.id,
    groupMembers: row.groupMembers,
    groupTopic: row.groupTopic,
    groupType: row.groupType,
    category: row.category,
    assignedProducerUserId: row.assignedProducerUserId,
    assignedProducer: row.assignedProducer
      ? { userId: row.assignedProducer.id, ...labeledUser(row.assignedProducer) }
      : null,
    assignedExecutiveProducerUserId: row.assignedExecutiveProducerUserId,
    assignedExecutiveProducer: row.assignedExecutiveProducer
      ? { userId: row.assignedExecutiveProducer.id, ...labeledUser(row.assignedExecutiveProducer) }
      : null,
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
    possibleInterviews: row.possibleInterviews,
    possibleIdeas: row.possibleIdeas,
    notes: row.notes,
    stageNotes: row.stageNotes ?? null,
    brainstormDocUrl: row.brainstormDocUrl ?? "",
    proofs: serializeProofs(row.proofOfContacts ?? [])
  };
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const { searchParams } = new URL(request.url);
    const requestedCycleNumber = parseCycleNumber(searchParams.get("cycle"));
    const data = await loadPackageProgressData(requestedCycleNumber);

    return ok({
      canEdit: canEditPackageCycle(access.role),
      canAssignProducer: canEditPackageCycle(access.role),
      ...data
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("Invalid cycle number.", 400);
    }
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canEditPackageCycle(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const canAssignProducer = canEditPackageCycle(access.role);

    await ensurePackageProgressDefaults();

    const payload = payloadSchema.parse(await request.json());

    const [assignableProducers, assignableExecutives] = canAssignProducer
      ? await Promise.all([loadAssignableProducers(), loadAssignableExecutiveProducers()])
      : [[], []];
    const assignableProducerIds = canAssignProducer
      ? new Set(assignableProducers.map((producer) => producer.userId))
      : null;
    const assignableExecutiveIds = canAssignProducer
      ? new Set(assignableExecutives.map((executive) => executive.userId))
      : null;

    const existingRows = await prisma.packageProgressRow.findMany({
      where: { cycleNumber: payload.cycleNumber },
      select: {
        id: true,
        initialCut: true,
        finalCut: true,
        initialCutManual: true,
        finalCutManual: true,
        assignedProducerUserId: true,
        assignedExecutiveProducerUserId: true,
        possibleInterviews: true,
        possibleIdeas: true,
        notes: true
      }
    });
    const priorById = new Map(existingRows.map((row) => [row.id, row]));

    const rows = payload.rows.map((row, index) => {
      const prior = row.id ? priorById.get(row.id) ?? null : null;
      const { initialCutManual, finalCutManual } = resolveManualCutFlags(row, prior);

      let assignedProducerUserId = prior?.assignedProducerUserId ?? null;
      if (canAssignProducer && assignableProducerIds) {
        const requested = row.assignedProducerUserId ?? null;
        if (requested === null) {
          assignedProducerUserId = null;
        } else if (assignableProducerIds.has(requested)) {
          assignedProducerUserId = requested;
        } else {
          assignedProducerUserId = prior?.assignedProducerUserId ?? null;
        }
      }

      let assignedExecutiveProducerUserId = prior?.assignedExecutiveProducerUserId ?? null;
      if (canAssignProducer && assignableExecutiveIds && row.assignedExecutiveProducerUserId !== undefined) {
        const requested = row.assignedExecutiveProducerUserId ?? null;
        if (requested === null) {
          assignedExecutiveProducerUserId = null;
        } else if (assignableExecutiveIds.has(requested)) {
          assignedExecutiveProducerUserId = requested;
        }
      }

      return {
        id: prior ? row.id : undefined,
        memberUserIds: [...new Set(row.memberUserIds ?? [])],
        data: {
          cycleNumber: payload.cycleNumber,
          rowOrder: index,
          groupMembers: row.groupMembers.trim(),
          groupTopic: row.groupTopic.trim(),
          groupType: row.groupType.trim(),
          category: row.category ?? null,
          assignedProducerUserId,
          assignedExecutiveProducerUserId,
          projectId: row.projectId ?? null,
          initialCutMediaItemId: row.initialCutMediaItemId ?? null,
          finalCutMediaItemId: row.finalCutMediaItemId ?? null,
          pitching: row.pitching ?? false,
          proofOfContact: row.proofOfContact,
          aRollBRoll: row.aRollBRoll,
          initialCut: row.initialCut,
          initialCutManual,
          revisedInitialCut: row.revisedInitialCut ?? false,
          finalCut: row.finalCut,
          finalCutManual,
          extension: row.extension,
          possibleInterviews: nextPackageRosterNote(row.possibleInterviews, prior?.possibleInterviews),
          possibleIdeas: nextPackageRosterNote(row.possibleIdeas, prior?.possibleIdeas),
          notes: (row.notes ?? prior?.notes ?? "").trim(),
          stageNotes: row.stageNotes ?? undefined
        }
      };
    });

    // Reconcile rather than delete-and-recreate: recreating would cascade away
    // the PackageProgressMember links that now tie packages to real students.
    await prisma.$transaction(async (tx) => {
      const keptIds = rows.map((row) => row.id).filter((id): id is string => Boolean(id));

      await tx.packageProgressRow.deleteMany({
        where: {
          cycleNumber: payload.cycleNumber,
          ...(keptIds.length > 0 ? { id: { notIn: keptIds } } : {})
        }
      });

      for (const row of rows) {
        const saved = row.id
          ? await tx.packageProgressRow.update({ where: { id: row.id }, data: row.data })
          : await tx.packageProgressRow.create({ data: row.data });

        await tx.packageProgressMember.deleteMany({
          where: {
            rowId: saved.id,
            ...(row.memberUserIds.length > 0 ? { userId: { notIn: row.memberUserIds } } : {})
          }
        });

        if (row.memberUserIds.length > 0) {
          await tx.packageProgressMember.createMany({
            data: row.memberUserIds.map((memberUserId) => ({
              rowId: saved.id,
              userId: memberUserId
            })),
            skipDuplicates: true
          });
        }
      }
    });

    await recomputeCycleCutStatus(payload.cycleNumber);

    const updatedRows = await prisma.packageProgressRow.findMany({
      where: { cycleNumber: payload.cycleNumber },
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
        }
      }
    });

    return ok({
      cycleNumber: payload.cycleNumber,
      rows: updatedRows.map(mapRowResponse)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
