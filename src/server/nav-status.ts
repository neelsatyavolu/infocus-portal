import type { PlatformRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { viewerAttention, visibleGroupRows, type AttentionRow } from "@/components/groups/group-attention";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { deadlineClosesAt, finalCutClosesAt } from "@/src/lib/deadlines";
import { approvedExtensionDaysFor, effectiveDeadline } from "@/src/lib/package-extensions";
import { canGradeFinalCut, gradersDoneWithGroup } from "@/src/lib/package-final-cut-scores";
import { membersAwaitingFinalCutScores } from "@/src/lib/package-revisions";
import { cycleCheckInDates } from "@/src/lib/package-stages";
import { hasPlatformRole, seesStudentGrades } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  currentPackageStage,
  EMPTY_NAV_STATUS,
  NAV_STATUS_FIELD,
  NAV_STATUS_PARTS,
  navStatusPartsFor,
  STAGE_BAR_PARTS,
  type NavPackageStatus,
  type NavStatus,
  type NavStatusPart,
  type NavStatusResponse,
  type PackageStageSlug
} from "@/src/lib/sidebar-nav";
import { countExtensionRequestsAwaitingUser } from "@/src/server/extension-requests";
import { canManageLivestreams } from "@/src/server/livestream-access";
import { visibleMeetingWhere } from "@/src/server/meetings-access";
import { loadStudentNavGates } from "@/src/server/package-cycle-stage";
import { activeCycleNumberFor, ensurePackageProgressDefaults } from "@/src/server/package-progress-data";

/**
 * The sidebar's status summary (GET /api/nav/status): small, role-gated counts built from the
 * same loaders and rules the pages use. Each part fails on its own (null + a log line), so one
 * slow table never blanks the sidebar. Parts run in small waves to stay inside the Workers
 * connection limit (6 outbound, pool of 5).
 */

export type NavStatusViewer = { userId: string; role: PlatformRole | null };

/** `parts=package,groups` → the parts asked for (all when empty); null when any name is unknown. */
const partsSchema = z.array(z.enum(NAV_STATUS_PARTS)).max(NAV_STATUS_PARTS.length * 2);

export function parseNavStatusParts(raw: string | null): NavStatusPart[] | null {
  const names = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return [...NAV_STATUS_PARTS];
  const parsed = partsSchema.safeParse(names);
  if (!parsed.success) return null;
  return NAV_STATUS_PARTS.filter((part) => parsed.data.includes(part));
}

export function emptyNavStatus(parts: NavStatusPart[]): NavStatusResponse {
  return { ...EMPTY_NAV_STATUS, parts, failed: [] };
}

type StageCycleDates = {
  proofOfContactDate: Date | null;
  aRollBRollDate: Date | null;
  initialCutDate: Date | null;
  finalCutDate: Date | null;
};

/**
 * When a stage closes for one student: the check-in date (Brainstorming = proof of contact)
 * at 11:59 PM Pacific, or the Final Cut close; an approved extension moves both by the
 * student's granted days (docs/class-rules-2026-27.md).
 */
export function stageClosesAt(stage: PackageStageSlug, cycle: StageCycleDates, extensionDays: number) {
  if (stage === "final-cut") {
    const due = effectiveDeadline(cycle.finalCutDate, extensionDays);
    return due ? finalCutClosesAt(due) : null;
  }
  const dates = cycleCheckInDates(cycle, extensionDays);
  const date = stage === "brainstorming" ? dates.proofOfContact : stage === "a-roll" ? dates.aRollBRoll : dates.initialCut;
  return date ? deadlineClosesAt(date) : null;
}

const PACKAGE_STAGE_SLUGS: PackageStageSlug[] = ["brainstorming", "a-roll", "initial-cut", "final-cut"];

async function loadPackagePart(userId: string): Promise<NavPackageStatus> {
  const gates = await loadStudentNavGates(userId);
  const remaining = "remainingExecutiveSignoffs" in gates ? gates.remainingExecutiveSignoffs : null;
  const base: NavPackageStatus = {
    hasRow: gates.hasRow,
    cycleNumber: gates.cycleNumber ?? null,
    unlocked: gates.unlocked,
    statuses: gates.hasRow ? gates.statuses : null,
    unread: gates.unread ?? null,
    remainingExecutiveSignoffs: gates.hasRow && typeof remaining === "number" ? remaining : null,
    currentStage: gates.hasRow ? currentPackageStage(gates.unlocked) : null,
    dueAt: null
  };
  if (!base.currentStage || base.cycleNumber === null) {
    return base;
  }
  const [cycle, row] = await Promise.all([
    prisma.packageCycle.findUnique({
      where: { cycleNumber: base.cycleNumber },
      select: { proofOfContactDate: true, aRollBRollDate: true, initialCutDate: true, finalCutDate: true }
    }),
    prisma.packageProgressRow.findFirst({
      where: { cycleNumber: base.cycleNumber, members: { some: { userId } } },
      select: {
        extension: true,
        extensionRequests: {
          where: { status: "APPROVED" },
          select: { requestedDays: true, grantedDays: true, grantedUserIds: true }
        }
      }
    })
  ]);
  if (!cycle) return base;
  const extensionDays = approvedExtensionDaysFor(row, userId);
  const dueDates = Object.fromEntries(
    PACKAGE_STAGE_SLUGS.map((stage) => [stage, stageClosesAt(stage, cycle, extensionDays)?.toISOString() ?? null])
  ) as Record<PackageStageSlug, string | null>;
  // The My package line's due date only matters while the current stage still owes work.
  const dueAt = base.statuses?.[base.currentStage] === "pending" ? dueDates[base.currentStage] : null;
  return { ...base, dueAt, dueDates };
}

export const GROUP_ATTENTION_SELECT = {
  id: true,
  groupTopic: true,
  groupMembers: true,
  category: true,
  pitching: true,
  proofOfContact: true,
  aRollBRoll: true,
  initialCut: true,
  finalCut: true,
  assignedProducerUserId: true,
  assignedExecutiveProducerUserId: true,
  brainstormDocUrl: true,
  finalCutMediaItemId: true,
  queuedForAirAt: true,
  approval: { select: { stage: true } },
  initialCutMediaItem: { select: { currentVersion: { select: { approvalStatus: true } } } },
  members: { select: { userId: true } },
  stageMedia: { where: { stage: "a-roll" }, select: { id: true }, take: 1 },
  finalCutScores: {
    select: { graderUserId: true, memberUserId: true, points: true, qualityPoints: true, effortPoints: true }
  },
  _count: { select: { proofOfContacts: true } }
} satisfies Prisma.PackageProgressRowSelect;

export type GroupAttentionRow = Prisma.PackageProgressRowGetPayload<{ select: typeof GROUP_ATTENTION_SELECT }>;
type FinalCutGrade = { userId: string; awardedFinalCutPoints: number | null; revisionCount: number };

/**
 * One slim roster row in the shape the Groups page's rows have (loadPackageProgressData), for
 * the page's own visibility and attention helpers. tests/nav-status.test.ts runs both loaders
 * over one fixture and checks the counts match.
 */
function toAttentionRow(
  row: GroupAttentionRow,
  finalCutGrades: FinalCutGrade[],
  officiallyGraded: ReadonlySet<string>
): AttentionRow {
  const memberIds = row.members.map((member) => member.userId);
  return {
    groupTopic: row.groupTopic,
    groupMembers: row.groupMembers,
    category: row.category,
    approvalStage: row.approval?.stage ?? "DRAFT",
    assignedProducerUserId: row.assignedProducerUserId,
    assignedExecutiveProducerUserId: row.assignedExecutiveProducerUserId,
    members: row.members,
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    initialCut: row.initialCut,
    finalCut: row.finalCut,
    // The page reads only how many proofs there are.
    proofs: Array.from({ length: row._count.proofOfContacts }, () => null),
    brainstormDocUrl: row.brainstormDocUrl,
    aRollHasMedia: row.stageMedia.length > 0,
    initialCutNeedsRevisions: row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
    finalCutMediaItemId: row.finalCutMediaItemId,
    queuedForAir: Boolean(row.queuedForAirAt),
    finalCutGraded:
      Boolean(row.finalCutMediaItemId) && memberIds.length > 0 && memberIds.every((id) => officiallyGraded.has(id)),
    finalCutScoredByUserIds: gradersDoneWithGroup(
      row.finalCutScores,
      membersAwaitingFinalCutScores(memberIds, row.finalCutScores, finalCutGrades)
    )
  };
}

/**
 * Groups that need this viewer: the Groups page's "Needs you" count, through the page's own
 * helpers (visibleGroupRows, then viewerAttention).
 */
export function countGroupsNeedingViewer(
  rows: GroupAttentionRow[],
  finalCutGrades: FinalCutGrade[],
  viewer: NavStatusViewer
) {
  const officiallyGraded = new Set(
    finalCutGrades.filter((grade) => grade.awardedFinalCutPoints !== null).map((grade) => grade.userId)
  );
  const visible = visibleGroupRows(
    rows.map((row) => toAttentionRow(row, finalCutGrades, officiallyGraded)),
    { platformRole: viewer.role, currentUserId: viewer.userId, producerCategory: null }
  );
  return visible.filter((row) => viewerAttention(viewer.role, viewer.userId, row) === "needed").length;
}

/** The Groups page shows "Needs you" to the adviser, executives and super admin only. */
function seesGroupAttention(role: PlatformRole | null) {
  return role === "ADVISER" || role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN";
}

async function loadGroupsPart(viewer: NavStatusViewer) {
  if (!seesGroupAttention(viewer.role)) return null;
  const cycleNumber = activeCycleNumberFor(await ensurePackageProgressDefaults());
  const [rows, finalCutGrades] = await Promise.all([
    prisma.packageProgressRow.findMany({ where: { cycleNumber }, select: GROUP_ATTENTION_SELECT }),
    canGradeFinalCut(viewer.role)
      ? prisma.packageGrade.findMany({
          where: { cycleNumber, awardedFinalCutPoints: { not: null } },
          select: { userId: true, awardedFinalCutPoints: true, revisionCount: true }
        })
      : Promise.resolve([] as FinalCutGrade[])
  ]);
  return countGroupsNeedingViewer(rows, finalCutGrades, viewer);
}

async function loadMeetingsPart(viewer: NavStatusViewer) {
  if (!hasPlatformRole(viewer.role, "ASSOCIATE_PRODUCER")) return null;
  return prisma.meeting.count({
    where: { AND: [visibleMeetingWhere({ userId: viewer.userId, name: "", role: viewer.role }), { status: "LIVE" }] }
  });
}

/** Pending participation changes the viewer may approve (anyone's but their own). */
async function loadPeoplePart(viewer: NavStatusViewer) {
  if (!hasPlatformRole(viewer.role, "ASSOCIATE_PRODUCER")) return null;
  return prisma.participationGradeRequest.count({
    where: { status: "PENDING", requestedById: { not: viewer.userId } }
  });
}

/** The Livestreams "Pending requests" list, for producers and appointed managers. */
async function loadLivestreamsPart(viewer: NavStatusViewer) {
  if (!(await canManageLivestreams(viewer.userId, viewer.role))) return null;
  return prisma.livestreamSignupRequest.count({ where: { status: "PENDING" } });
}

async function loadGradesPart(viewer: NavStatusViewer) {
  if (!seesStudentGrades(viewer.role)) return null;
  const latest = await prisma.packageGrade.findFirst({
    where: { userId: viewer.userId, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true }
  });
  return latest?.publishedAt?.toISOString() ?? null;
}

async function loadAdminPart(viewer: NavStatusViewer) {
  if (!hasPlatformRole(viewer.role, "EXECUTIVE_PRODUCER")) return null;
  return prisma.platformAccessRequest.count({ where: { status: "PENDING" } });
}

type PartLoader = (viewer: NavStatusViewer) => Promise<NavStatus[keyof NavStatus]>;

const LOADERS: Record<NavStatusPart, PartLoader> = {
  package: (viewer) => loadPackagePart(viewer.userId),
  extensions: (viewer) => countExtensionRequestsAwaitingUser(viewer.userId, viewer.role),
  groups: loadGroupsPart,
  meetings: loadMeetingsPart,
  people: loadPeoplePart,
  livestreams: loadLivestreamsPart,
  grades: loadGradesPart,
  admin: loadAdminPart
};

/**
 * Each wave runs together, waves run one after another. The stage bar's parts (package and
 * extension requests) share the first wave, as the two requests the shell used to make ran side
 * by side, so a request for just those never waits on a second wave.
 */
const WAVES: NavStatusPart[][] = [
  ["package", "extensions"],
  ["groups", "meetings", "people"],
  ["livestreams", "grades", "admin"]
];

export async function loadNavStatus(
  viewer: NavStatusViewer,
  parts: NavStatusPart[],
  loaders: Record<NavStatusPart, PartLoader> = LOADERS
): Promise<NavStatusResponse> {
  const wanted = new Set(parts);
  let status: NavStatus = { ...EMPTY_NAV_STATUS };
  const failed: NavStatusPart[] = [];
  for (const wave of WAVES) {
    const results = await Promise.all(
      wave
        .filter((part) => wanted.has(part))
        .map(async (part) => {
          try {
            return { part, value: await loaders[part](viewer), ok: true as const };
          } catch (error) {
            console.error(`Nav status part failed: ${part}`, error);
            return { part, value: null, ok: false as const };
          }
        })
    );
    for (const result of results) {
      if (!result.ok) failed.push(result.part);
      status = { ...status, [NAV_STATUS_FIELD[result.part]]: result.value };
    }
  }
  return { ...status, parts: NAV_STATUS_PARTS.filter((part) => wanted.has(part)), failed };
}

export type InitialNavStatus = { parts: NavStatusPart[]; status: Promise<NavStatusResponse | null> };

/**
 * The first statuses, started by the app layout so they stream in with the page instead of
 * waiting for hydration and a request of their own. Only the stage bar's parts (package and
 * extension requests: the badges that change most, fresh for 15 s): they share the pages' cached
 * ensurePackageProgressDefaults and cost about four small queries, while the rest (the Groups
 * roster for executives) would compete with the page for connections; the client loads those as
 * before. Not awaited by the layout, so the shell never waits on it; never rejects (null = the
 * client loads these parts itself). Same parts and App Review rule as GET /api/nav/status.
 */
export function startInitialNavStatus(viewer: NavStatusViewer, email: string | null): InitialNavStatus {
  const parts = navStatusPartsFor(viewer.role).filter((part) => STAGE_BAR_PARTS.includes(part));
  const status = isAppReviewEmail(email)
    ? Promise.resolve(emptyNavStatus(parts))
    : loadNavStatus(viewer, parts).catch((error: unknown) => {
        console.error("Initial nav status failed", error);
        return null;
      });
  return { parts, status };
}
