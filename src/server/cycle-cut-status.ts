import { MediaStatus } from "@prisma/client";
import {
  buildUserNameCandidates,
  extractMentionUserIds,
  groupMembersIncludeUserName
} from "@/src/lib/group-members";
import { prisma } from "@/src/lib/prisma";

export type CutKind = "INITIAL" | "FINAL";

const VALID_CYCLE_NUMBERS = new Set([1, 2, 3, 4]);

type SubmittedCutState = {
  initialCut: boolean;
  finalCut: boolean;
  initialCutManual?: boolean;
  finalCutManual?: boolean;
};

type PriorCutState = {
  initialCut: boolean;
  finalCut: boolean;
  initialCutManual: boolean;
  finalCutManual: boolean;
};

/**
 * Decides whether the initial/final cut fields are manually overridden.
 *
 * A field is "manual" once a person has touched it, and stays manual forever:
 * a human decision always outranks automatic recomputation. The flag is set
 * the moment any of these is true and is never cleared afterwards:
 *  - the client explicitly reports a human override on this save,
 *  - the prior persisted row was already manual,
 *  - the submitted value differs from the prior persisted value.
 */
export function resolveManualCutFlags(
  submitted: SubmittedCutState,
  prior: PriorCutState | null
): { initialCutManual: boolean; finalCutManual: boolean } {
  return {
    initialCutManual:
      Boolean(submitted.initialCutManual) ||
      (prior?.initialCutManual ?? false) ||
      (prior ? submitted.initialCut !== prior.initialCut : false),
    finalCutManual:
      Boolean(submitted.finalCutManual) ||
      (prior?.finalCutManual ?? false) ||
      (prior ? submitted.finalCut !== prior.finalCut : false)
  };
}

export function parseCycleNumberFromProjectName(projectName: string | null | undefined): number | null {
  if (!projectName) return null;
  const match = projectName.match(/package\s+cycle\s+(\d+)/i);
  if (!match) return null;
  const cycleNumber = Number(match[1]);
  if (!Number.isInteger(cycleNumber) || !VALID_CYCLE_NUMBERS.has(cycleNumber)) return null;
  return cycleNumber;
}

export function getCutKindFromFolderName(folderName: string | null | undefined): CutKind | null {
  if (!folderName) return null;
  const normalized = folderName.trim().toLowerCase();
  if (normalized === "initial cut") return "INITIAL";
  if (normalized === "final cut") return "FINAL";
  return null;
}

type QualifyingMediaRow = {
  id: string;
  cutKind: CutKind;
  assignees: Array<{
    userId: string;
    nameCandidates: Set<string>;
  }>;
};

async function loadQualifyingMediaForCycle(cycleNumber: number): Promise<QualifyingMediaRow[]> {
  const items = await prisma.mediaItem.findMany({
    where: {
      deletedAt: null,
      project: {
        name: {
          contains: `Package Cycle ${cycleNumber}`,
          mode: "insensitive"
        }
      },
      folder: {
        name: {
          in: ["Initial Cut", "Final Cut"],
          mode: "insensitive"
        }
      },
      versions: {
        some: { status: MediaStatus.READY }
      }
    },
    select: {
      id: true,
      project: { select: { name: true } },
      folder: { select: { name: true } },
      memberAssignments: {
        select: {
          userId: true,
          user: { select: { name: true, nickname: true, email: true } }
        }
      }
    }
  });

  const qualifying: QualifyingMediaRow[] = [];
  for (const item of items) {
    if (parseCycleNumberFromProjectName(item.project.name) !== cycleNumber) continue;
    const cutKind = getCutKindFromFolderName(item.folder?.name);
    if (!cutKind) continue;
    if (item.memberAssignments.length === 0) continue;
    qualifying.push({
      id: item.id,
      cutKind,
      assignees: item.memberAssignments.map((assignment) => ({
        userId: assignment.userId,
        nameCandidates: buildUserNameCandidates(assignment.user.name, assignment.user.email, assignment.user.nickname)
      }))
    });
  }
  return qualifying;
}

function rowMatchesAnyAssignee(
  groupMembers: string,
  assignees: QualifyingMediaRow["assignees"]
): boolean {
  if (!groupMembers.trim() || assignees.length === 0) return false;
  const mentionIds = new Set(extractMentionUserIds(groupMembers));
  for (const assignee of assignees) {
    if (mentionIds.has(assignee.userId)) return true;
    if (
      assignee.nameCandidates.size > 0 &&
      groupMembersIncludeUserName(groupMembers, assignee.nameCandidates)
    ) {
      return true;
    }
  }
  return false;
}

export async function recomputeCycleCutStatus(cycleNumber: number): Promise<void> {
  if (!VALID_CYCLE_NUMBERS.has(cycleNumber)) return;

  const [rows, qualifying] = await Promise.all([
    prisma.packageProgressRow.findMany({
      where: { cycleNumber },
      select: {
        id: true,
        groupMembers: true,
        initialCut: true,
        finalCut: true,
        initialCutManual: true,
        finalCutManual: true
      }
    }),
    loadQualifyingMediaForCycle(cycleNumber)
  ]);

  if (rows.length === 0) return;

  const initialMedia = qualifying.filter((media) => media.cutKind === "INITIAL");
  const finalMedia = qualifying.filter((media) => media.cutKind === "FINAL");

  for (const row of rows) {
    const initialDone = initialMedia.some((media) => rowMatchesAnyAssignee(row.groupMembers, media.assignees));
    const finalDone = finalMedia.some((media) => rowMatchesAnyAssignee(row.groupMembers, media.assignees));

    const updates: { initialCut?: boolean; finalCut?: boolean } = {};
    if (!row.initialCutManual && initialDone !== row.initialCut) {
      updates.initialCut = initialDone;
    }
    if (!row.finalCutManual && finalDone !== row.finalCut) {
      updates.finalCut = finalDone;
    }

    if (Object.keys(updates).length === 0) continue;

    await prisma.packageProgressRow.update({
      where: { id: row.id },
      data: updates
    });
  }
}

export async function recomputeForProjectName(projectName: string | null | undefined): Promise<void> {
  const cycleNumber = parseCycleNumberFromProjectName(projectName);
  if (cycleNumber === null) return;
  await recomputeCycleCutStatus(cycleNumber);
}

export async function recomputeForMediaItem(mediaItemId: string): Promise<void> {
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    select: { project: { select: { name: true } } }
  });
  await recomputeForProjectName(item?.project.name);
}

export async function recomputeAllCycles(): Promise<void> {
  for (const cycleNumber of VALID_CYCLE_NUMBERS) {
    await recomputeCycleCutStatus(cycleNumber);
  }
}
