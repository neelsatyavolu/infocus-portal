import type { PlatformRole, Prisma } from "@prisma/client";
import { visibleGroupRows } from "@/components/groups/group-attention";
import {
  buildCalendarPart,
  UPCOMING_DAYS,
  type LivestreamRow,
  type ShowDayRow,
  type WeekEvent
} from "@/components/home/executive-calendar";
import {
  buildClassOverview,
  buildGradingQueue,
  groupNeedItem,
  latestActivity,
  orderReviewQueue,
  reviewQueueRow,
  type ActivityEntry,
  type ClassOverview,
  type GradingQueueRow,
  type GroupActivitySource,
  type GroupFacts,
  type GroupReadySince,
  type ReviewQueueRow
} from "@/components/home/executive-groups";
import { orderNeeds, type NeedItem } from "@/components/home/executive-needs";
import { buildGroupRowView, type CycleDates, type GroupRow } from "@/app/(app)/groups/group-row-model";
import { buildBoardDeadlines } from "@/src/lib/class-board";
import { pacificDateKey } from "@/src/lib/deadlines";
import { remainingFromApproval } from "@/src/lib/package-approval";
import { serializeProofs } from "@/src/lib/package-brainstorm";
import { approvedExtensionDaysFor, extensionRequestAwaitsUser } from "@/src/lib/package-extensions";
import { gradersDoneWithGroup } from "@/src/lib/package-final-cut-scores";
import { membersAwaitingFinalCutScores } from "@/src/lib/package-revisions";
import { currentCutRevisionStage } from "@/src/lib/initial-cut-review-versions";
import { APPROVAL_COMMENT_PREFIX } from "@/src/lib/package-stage-comments";
import { earlyStageNeedsChanges } from "@/src/lib/package-stage-status";
import { buildPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey, formatShowDateShort, parseDateKeyUtc } from "@/src/lib/show-assignment";
import { labeledUser } from "@/src/lib/user-display";
import { ASSOCIATE_REVIEW_AUDIT } from "@/src/server/associate-review-history";
import { mayDecideExtensionRequest } from "@/src/server/extension-requests";
import { canManageLivestreams } from "@/src/server/livestream-access";
import {
  activeCycleNumberFor,
  ensurePackageProgressDefaults,
  loadRequiredFinalCutGraders
} from "@/src/server/package-progress-data";

/**
 * The executive Home (/dashboard for executives, the adviser and super admin): what waits on the
 * viewer, the class's review and grading queues, the cycle's groups by stage, the next two weeks
 * of shows and livestreams, and recent class activity. Built from the loaders and rules the pages
 * use (the Groups row view, the sidebar's counts, the Master Calendar's day model). Queries run
 * in three small waves (at most 5 at once: the Prisma pool on Workers); each part fails on its
 * own (logged, listed in `failed`) and the rest still renders.
 */

export type ExecutiveViewer = { userId: string; role: PlatformRole | null };

export type ExecutivePart =
  | "cycle"
  | "groups"
  | "graders"
  | "extensions"
  | "participation"
  | "access"
  | "livestreams"
  | "calendar";

export type WeekDeadline = { key: string; label: string; dateKey: string; dateLabel: string; daysUntil: number };
export type { LivestreamRow, ShowDayRow, WeekEvent };

export type ExecutiveDashboard = {
  cycleNumber: number | null;
  /** Ordered by urgency (orderNeeds). */
  needs: NeedItem[];
  overview: ClassOverview | null;
  /** Null when the roster failed to load (as for every group part below). */
  reviewQueue: ReviewQueueRow[] | null;
  gradingQueue: GradingQueueRow[] | null;
  /** False when the grader list failed: scoring rows then show counts without names. */
  gradersLoaded: boolean;
  activity: ActivityEntry[] | null;
  /** Stage deadlines in the next 14 days; null when the cycles failed to load. */
  deadlines: WeekDeadline[] | null;
  /** Shows and livestreams in the next 7 days; null when the calendar failed to load. */
  events: WeekEvent[] | null;
  /** Show and PA days in the next 14 days. */
  showDays: ShowDayRow[] | null;
  /** Livestreams in the next 14 days. */
  livestreams: LivestreamRow[] | null;
  failed: ExecutivePart[];
};

const DEADLINE_DAYS = 14;

// ---------------------------------------------------------------------------------------------
// Groups: the Groups page's row fields (loadPackageProgressData), plus the names the queues show.

const PERSON = { select: { name: true, nickname: true, email: true } } as const;

const GROUP_SELECT = {
  id: true,
  cycleNumber: true,
  groupTopic: true,
  groupMembers: true,
  groupType: true,
  category: true,
  pitching: true,
  proofOfContact: true,
  aRollBRoll: true,
  initialCut: true,
  finalCut: true,
  extension: true,
  assignedProducerUserId: true,
  assignedExecutiveProducerUserId: true,
  assignedProducer: PERSON,
  assignedExecutiveProducer: PERSON,
  brainstormDocUrl: true,
  initialCutMediaItemId: true,
  finalCutMediaItemId: true,
  queuedForAirAt: true,
  awaitingRevisedInitialCut: true,
  members: { select: { userId: true, user: PERSON } },
  proofOfContacts: { select: { id: true, slot: true, fileName: true, mimeType: true, updatedAt: true } },
  approval: {
    select: {
      stage: true,
      controversial: true,
      signoffs: {
        select: { userId: true, stage: true, approved: true, mediaItemId: true, createdAt: true, user: PERSON }
      }
    }
  },
  initialCutMediaItem: {
    select: { currentVersion: { select: { id: true, createdAt: true, versionNumber: true, approvalStatus: true } } }
  },
  finalCutMediaItem: { select: { createdAt: true } },
  stageMedia: {
    where: { stage: "a-roll" },
    select: { createdAt: true, mediaItem: { select: { currentVersionId: true } } },
    orderBy: { createdAt: "desc" },
    take: 1
  },
  stageComments: {
    where: { stage: { in: ["brainstorming", "a-roll"] }, NOT: { body: { startsWith: APPROVAL_COMMENT_PREFIX } } },
    select: { stage: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    distinct: ["stage"]
  },
  finalCutScores: {
    select: { graderUserId: true, memberUserId: true, points: true, qualityPoints: true, effortPoints: true }
  },
  extensionRequests: {
    where: { status: "APPROVED" },
    select: { requestedDays: true, grantedDays: true, grantedUserIds: true }
  }
} satisfies Prisma.PackageProgressRowSelect;

type GroupRecord = Prisma.PackageProgressRowGetPayload<{ select: typeof GROUP_SELECT }>;
type FinalCutGrade = { userId: string; awardedFinalCutPoints: number | null; revisionCount: number; publishedAt?: Date | null };
type Cycle = Awaited<ReturnType<typeof ensurePackageProgressDefaults>>[number];
type Grader = { userId: string; name: string | null; email: string | null };

function iso(date: Date | null | undefined) {
  return date?.toISOString() ?? null;
}

/** Associate-review "ready" events, newest first per group and stage/version (the Groups loader's map). */
async function loadReadyAt(rowIds: string[]) {
  if (rowIds.length === 0) return new Map<string, Date>();
  const events = await prisma.auditLog.findMany({
    where: {
      action: ASSOCIATE_REVIEW_AUDIT,
      targetType: "PackageProgressRow",
      targetId: { in: rowIds },
      metadata: { path: ["kind"], equals: "ready" }
    },
    select: { targetId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" }
  });
  const readyAt = new Map<string, Date>();
  for (const event of events) {
    const meta = event.metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const key = `${event.targetId}:${meta.stage === "brainstorming" ? meta.stage : meta.mediaVersionId}`;
    if (!readyAt.has(key)) readyAt.set(key, event.createdAt);
  }
  return readyAt;
}

/** The newest approving sign-off at an approval stage: when the next stage became ready. */
function latestApproval(record: GroupRecord, stage: string) {
  const times = (record.approval?.signoffs ?? [])
    .filter((signoff) => signoff.stage === stage && signoff.approved)
    .map((signoff) => signoff.createdAt.getTime());
  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

function personName(person: { name: string | null; nickname?: string | null; email: string | null } | null) {
  return person ? labeledUser(person).name?.trim() || person.email || null : null;
}

function toGroupRow(record: GroupRecord, readyAt: Map<string, Date>, finalCutGrades: FinalCutGrade[]) {
  const memberIds = record.members.map((member) => member.userId);
  const officiallyGraded = new Set(finalCutGrades.map((grade) => grade.userId));
  const published = new Set(finalCutGrades.filter((grade) => grade.publishedAt).map((grade) => grade.userId));
  const cutVersion = record.initialCutMediaItem?.currentVersion ?? null;
  const aRoll = record.stageMedia[0] ?? null;
  const reviewReadyAt = {
    brainstorming: iso(readyAt.get(`${record.id}:brainstorming`)),
    "a-roll": iso(readyAt.get(`${record.id}:${aRoll?.mediaItem.currentVersionId}`) ?? aRoll?.createdAt),
    "initial-cut": iso(readyAt.get(`${record.id}:${cutVersion?.id}`) ?? cutVersion?.createdAt)
  };
  const hasFinalCut = Boolean(record.finalCutMediaItemId) && memberIds.length > 0;
  const row: GroupRow = {
    id: record.id,
    reviewReadyAt,
    groupMembers: record.groupMembers,
    groupTopic: record.groupTopic,
    groupType: record.groupType,
    category: record.category,
    assignedProducerUserId: record.assignedProducerUserId,
    assignedExecutiveProducerUserId: record.assignedExecutiveProducerUserId,
    memberUserIds: memberIds,
    members: record.members.map((member) => ({ userId: member.userId, ...labeledUser(member.user) })),
    initialCutMediaItemId: record.initialCutMediaItemId,
    finalCutMediaItemId: record.finalCutMediaItemId,
    pitching: record.pitching,
    proofOfContact: record.proofOfContact,
    aRollBRoll: record.aRollBRoll,
    initialCut: record.initialCut,
    finalCut: record.finalCut,
    extension: record.extension,
    extensionDays: approvedExtensionDaysFor(record),
    brainstormDocUrl: record.brainstormDocUrl,
    proofs: serializeProofs(record.proofOfContacts),
    approvalStage: record.approval?.stage ?? "DRAFT",
    remainingExecutiveSignoffs: remainingFromApproval(record.approval),
    awaitingRevisedInitialCut: record.awaitingRevisedInitialCut,
    initialCutVersionNumber: cutVersion?.versionNumber ?? null,
    initialCutNeedsRevisions: cutVersion?.approvalStatus === "NEEDS_CHANGES",
    initialCutReviewStage: currentCutRevisionStage(
      record.initialCutMediaItemId && cutVersion
        ? { mediaItemId: record.initialCutMediaItemId, createdAt: cutVersion.createdAt }
        : null,
      record.approval?.signoffs ?? []
    ),
    aRollHasMedia: record.stageMedia.length > 0,
    ...earlyStageNeedsChanges(record),
    queuedForAir: Boolean(record.queuedForAirAt),
    finalCutGraded: hasFinalCut && memberIds.every((id) => officiallyGraded.has(id)),
    finalCutGradesPublished: hasFinalCut && memberIds.every((id) => published.has(id)),
    finalCutScoredByUserIds: gradersDoneWithGroup(
      record.finalCutScores,
      membersAwaitingFinalCutScores(memberIds, record.finalCutScores, finalCutGrades)
    )
  };
  const readySince: GroupReadySince = {
    pitching: reviewReadyAt.brainstorming,
    brainstorming: reviewReadyAt.brainstorming,
    "a-roll": reviewReadyAt["a-roll"],
    "initial-stage-1": reviewReadyAt["initial-cut"],
    "initial-stage-2": iso(latestApproval(record, "ASSOCIATE_REVIEW")) ?? reviewReadyAt["initial-cut"],
    "initial-stage-3": iso(latestApproval(record, "ADVISER_REVIEW")) ?? reviewReadyAt["initial-cut"],
    "final-cut": iso(record.finalCutMediaItem?.createdAt)
  };
  const publishedTimes = finalCutGrades
    .filter((grade) => memberIds.includes(grade.userId) && grade.publishedAt)
    .map((grade) => grade.publishedAt!.getTime());
  const activity: Omit<GroupActivitySource, "key" | "topic" | "href"> = {
    signoffs: (record.approval?.signoffs ?? []).map((signoff) => ({
      stage: signoff.stage,
      approved: signoff.approved,
      createdAt: signoff.createdAt,
      actorName: personName(signoff.user)
    })),
    brainstormReadyAt: reviewReadyAt.brainstorming,
    aRollAt: aRoll?.createdAt ?? null,
    cutVersion: cutVersion ? { versionNumber: cutVersion.versionNumber, createdAt: cutVersion.createdAt } : null,
    finalCutAt: record.finalCutMediaItem?.createdAt ?? null,
    queuedAt: record.queuedForAirAt,
    gradesPublishedAt: hasFinalCut && row.finalCutGradesPublished && publishedTimes.length > 0 ? new Date(Math.max(...publishedTimes)) : null
  };
  const assignedName = personName(record.assignedExecutiveProducer) ?? personName(record.assignedProducer);
  return { row, readySince, activity, assignedName, finalCutSubmittedAt: iso(record.finalCutMediaItem?.createdAt) };
}

export function cycleDatesOf(cycle: Cycle | undefined): CycleDates | null {
  if (!cycle) return null;
  return {
    pitching: iso(cycle.pitchingDate),
    proofOfContact: iso(cycle.proofOfContactDate),
    aRollBRoll: iso(cycle.aRollBRollDate),
    initialCut: iso(cycle.initialCutDate),
    finalCut: iso(cycle.finalCutDate)
  };
}

/**
 * The Groups page's rows for this viewer (visibleGroupRows, buildGroupRowView): the ones waiting
 * on them as "Needs you" rows, the class review and grading queues, the overview and the latest
 * activity. `graders` is null when the grader list failed.
 */
export function buildGroupsPart(
  records: GroupRecord[],
  finalCutGrades: FinalCutGrade[],
  readyAt: Map<string, Date>,
  viewer: ExecutiveViewer,
  dates: CycleDates | null,
  now: Date,
  graders: Grader[] | null = null
) {
  const mapped = new Map(
    records.map((record) => {
      const group = toGroupRow(record, readyAt, finalCutGrades);
      return [record.id, group] as const;
    })
  );
  const rows = visibleGroupRows(
    [...mapped.values()].map(({ row }) => row),
    { platformRole: viewer.role, currentUserId: viewer.userId, producerCategory: null }
  );
  const ctx = { platformRole: viewer.role, currentUserId: viewer.userId, cycleDates: dates, now };
  const facts: GroupFacts[] = rows.map((row, index) => {
    const group = mapped.get(row.id ?? "");
    return {
      view: buildGroupRowView(row, index, ctx),
      readySince: group?.readySince ?? {},
      assignedName: group?.assignedName ?? null,
      finalCutSubmittedAt: group?.finalCutSubmittedAt ?? null
    };
  });
  const needs = facts.flatMap((fact) => {
    const item = groupNeedItem(fact.view, fact.readySince, dates);
    return item ? [item] : [];
  });
  const reviewQueue = orderReviewQueue(
    facts.flatMap((fact) => {
      const row = reviewQueueRow(fact, dates);
      return row ? [row] : [];
    }),
    now
  );
  const activity = latestActivity(
    facts.flatMap(({ view }) => {
      const group = mapped.get(view.row.id ?? "");
      return group && view.href ? [{ key: view.key, topic: view.topic, href: view.href, ...group.activity }] : [];
    })
  );
  return {
    needs,
    overview: buildClassOverview(facts.map((fact) => fact.view)),
    reviewQueue,
    gradingQueue: buildGradingQueue(facts, graders, viewer.userId),
    activity
  };
}

/**
 * Every cycle up to the current one, each built with its own dates and grades, then merged: the
 * queues, Needs you and activity span them (an earlier cycle's rows carry "Cycle N"), while the
 * class overview is the current cycle's.
 */
export function buildAllCyclesPart(
  records: GroupRecord[],
  finalCutGrades: Array<FinalCutGrade & { cycleNumber: number }>,
  readyAt: Map<string, Date>,
  viewer: ExecutiveViewer,
  cycles: Cycle[],
  activeCycle: number,
  now: Date,
  graders: Grader[] | null = null
) {
  // A row or grade without a cycle number counts as the current cycle's; cycle 0 (custom
  // Publishing Queue packages) is never a roster group.
  const cycleOf = (entry: { cycleNumber?: number | null }) => entry.cycleNumber ?? activeCycle;
  const numbers = [...new Set(records.map(cycleOf))].filter((number) => number >= 1).sort((a, b) => a - b);
  const parts = numbers.map((number) => {
    const part = buildGroupsPart(
      records.filter((record) => cycleOf(record) === number),
      finalCutGrades.filter((grade) => cycleOf(grade) === number),
      readyAt,
      viewer,
      cycleDatesOf(cycles.find((cycle) => cycle.cycleNumber === number)),
      now,
      graders
    );
    const cycleLabel = number === activeCycle ? null : `Cycle ${number}`;
    return {
      number,
      part: {
        ...part,
        reviewQueue: part.reviewQueue.map((row) => ({ ...row, cycleLabel })),
        gradingQueue: part.gradingQueue.map((row) => ({ ...row, cycleLabel }))
      }
    };
  });
  const current = parts.find((entry) => entry.number === activeCycle)?.part;
  return {
    needs: parts.flatMap(({ part }) => part.needs),
    overview: current?.overview ?? buildGroupsPart([], [], readyAt, viewer, null, now, graders).overview,
    reviewQueue: orderReviewQueue(
      parts.flatMap(({ part }) => part.reviewQueue),
      now
    ),
    gradingQueue: parts.flatMap(({ part }) => part.gradingQueue),
    activity: parts
      .flatMap(({ part }) => part.activity)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 10)
  };
}

// ---------------------------------------------------------------------------------------------
// Counted kinds: one row each, with the oldest item's age.

function countNeed(
  kind: NeedItem["kind"],
  count: number,
  oldest: Date | null | undefined,
  copy: { title: string; need: (count: number) => string; href: string }
): NeedItem[] {
  if (count <= 0) return [];
  return [{ key: kind, kind, title: copy.title, need: copy.need(count), href: copy.href, dueAt: null, waitingSince: iso(oldest) }];
}

/** Pending extension requests that wait on this viewer (countExtensionRequestsAwaitingUser's rule), with the oldest. */
async function loadExtensionNeeds(viewer: ExecutiveViewer) {
  const pending = await prisma.packageExtensionRequest.findMany({
    where: { status: "PENDING" },
    select: {
      createdAt: true,
      producerGranted: true,
      memberConsents: { select: { userId: true, agreed: true } },
      approvals: { select: { userId: true, approved: true } },
      progressRow: { select: { assignedProducerUserId: true, members: { select: { userId: true } } } }
    }
  });
  const waiting = pending.filter((request) => {
    const members = request.progressRow?.members ?? [];
    return extensionRequestAwaitsUser(
      {
        status: "PENDING",
        producerGranted: request.producerGranted,
        memberUserIds:
          members.length > 0 ? members.map((member) => member.userId) : request.memberConsents.map((consent) => consent.userId),
        consents: request.memberConsents,
        approvals: request.approvals,
        viewerMayDecide: mayDecideExtensionRequest(viewer.role, viewer.userId, {
          producerGranted: request.producerGranted,
          assignedProducerUserId: request.progressRow?.assignedProducerUserId,
          members
        })
      },
      viewer.userId
    );
  });
  const oldest = waiting.reduce<Date | null>((min, request) => (!min || request.createdAt < min ? request.createdAt : min), null);
  return countNeed("extensions", waiting.length, oldest, {
    title: "Extension requests",
    need: (count) => `${count} waiting on you`,
    href: "/extension-requests"
  });
}

/** Participation changes from other executives (the sidebar's Grade Editor count). */
async function loadParticipationNeeds(viewer: ExecutiveViewer) {
  const pending = await prisma.participationGradeRequest.aggregate({
    where: { status: "PENDING", requestedById: { not: viewer.userId } },
    _count: { _all: true },
    _min: { createdAt: true }
  });
  return countNeed("participation", pending._count._all, pending._min.createdAt, {
    title: "Participation changes",
    need: (count) => `${count} to approve`,
    href: "/grade-editor?view=participation"
  });
}

/** Access requests, for roles that see Admin → Access requests. */
async function loadAccessNeeds(viewer: ExecutiveViewer) {
  if (!buildPlatformAccess(viewer.role).canManageAccounts) return [];
  const pending = await prisma.platformAccessRequest.aggregate({
    where: { status: "PENDING" },
    _count: { _all: true },
    _min: { requestedAt: true }
  });
  return countNeed("access", pending._count._all, pending._min.requestedAt, {
    title: "Access requests",
    need: (count) => (count === 1 ? "1 person waiting" : `${count} people waiting`),
    href: "/admin"
  });
}

/** Livestream sign-ups waiting on a manager (the Livestreams "Pending requests" list). */
async function loadLivestreamNeeds(viewer: ExecutiveViewer) {
  if (!(await canManageLivestreams(viewer.userId, viewer.role))) return [];
  const pending = await prisma.livestreamSignupRequest.aggregate({
    where: { status: "PENDING" },
    _count: { _all: true },
    _min: { createdAt: true }
  });
  return countNeed("livestreams", pending._count._all, pending._min.createdAt, {
    title: "Livestream sign-ups",
    need: (count) => `${count} to review`,
    href: "/livestreams"
  });
}

/** Stage deadlines (cycle dates and the Class Board's Stage 2 and 3 dates) in the next 14 days. */
export function buildWeekDeadlines(cycles: Cycle[], todayKey: string, activeCycle: number): WeekDeadline[] {
  return buildBoardDeadlines(
    cycles.map((cycle) => ({
      cycleNumber: cycle.cycleNumber,
      pitching: cycle.pitchingDate,
      proofOfContact: cycle.proofOfContactDate,
      aRollBRoll: cycle.aRollBRollDate,
      initialCut: cycle.initialCutDate,
      finalCut: cycle.finalCutDate
    })),
    todayKey
  )
    .filter((deadline) => deadline.daysUntil <= DEADLINE_DAYS)
    .map((deadline) => ({
      key: deadline.id,
      label: deadline.cycleNumber === activeCycle ? deadline.label : `Cycle ${deadline.cycleNumber} · ${deadline.label}`,
      dateKey: deadline.dateKey,
      dateLabel: formatShowDateShort(deadline.dateKey),
      daysUntil: deadline.daysUntil
    }));
}

// ---------------------------------------------------------------------------------------------
// The waves.

async function attempt<T>(part: ExecutivePart, failed: ExecutivePart[], load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`Executive dashboard part failed: ${part}`, error);
    failed.push(part);
    return null;
  }
}

export async function loadExecutiveDashboard(viewer: ExecutiveViewer, now: Date = new Date()): Promise<ExecutiveDashboard> {
  const failed: ExecutivePart[] = [];
  const todayKey = pacificDateKey(now);
  const endKey = addDaysToDateKey(todayKey, UPCOMING_DAYS);

  // Wave 1 (5): the cycles, and the counted kinds.
  const [cycles, extensions, participation, access, livestreamSignups] = await Promise.all([
    attempt("cycle", failed, () => ensurePackageProgressDefaults()),
    attempt("extensions", failed, () => loadExtensionNeeds(viewer)),
    attempt("participation", failed, () => loadParticipationNeeds(viewer)),
    attempt("access", failed, () => loadAccessNeeds(viewer)),
    attempt("livestreams", failed, () => loadLivestreamNeeds(viewer))
  ]);
  const cycleNumber = cycles ? activeCycleNumberFor(cycles, now) : null;
  const activeCycle = cycles?.find((cycle) => cycle.cycleNumber === cycleNumber);

  // Wave 2 (5): the roster and Final Cut grades of this cycle and every earlier one (an earlier
  // cycle can still have cuts in review or grades owed), and two weeks of calendar.
  const [groupRecords, calendarBase] = await Promise.all([
    cycleNumber === null
      ? Promise.resolve(null)
      : attempt("groups", failed, () =>
          Promise.all([
            prisma.packageProgressRow.findMany({
              // Cycle 0 holds custom Publishing Queue packages, not roster groups: leave them out.
              where: { cycleNumber: { gte: 1, lte: cycleNumber } },
              orderBy: [{ cycleNumber: "asc" }, { rowOrder: "asc" }],
              select: GROUP_SELECT
            }),
            prisma.packageGrade.findMany({
              where: { cycleNumber: { gte: 1, lte: cycleNumber }, awardedFinalCutPoints: { not: null } },
              select: { userId: true, cycleNumber: true, awardedFinalCutPoints: true, revisionCount: true, publishedAt: true }
            })
          ])
        ),
    attempt("calendar", failed, () =>
      Promise.all([
        prisma.schoolCalendarDay.findMany({
          where: { date: { gte: todayKey, lt: endKey } },
          select: { date: true, kind: true, label: true }
        }),
        prisma.masterCalendarEntry.findMany({
          where: { date: { gte: todayKey, lt: endKey } },
          select: { date: true, content: true }
        }),
        prisma.packageProgressRow.findMany({
          where: { queuedForAirAt: { not: null }, queuedForShowDate: { gte: todayKey, lt: endKey } },
          select: { id: true, groupTopic: true, cycleNumber: true, queuedForShowDate: true },
          orderBy: { queuedForAirAt: "asc" }
        })
      ])
    )
  ]);

  // Wave 3 (4 at most): when each group became ready, the Final Cut graders (two lookups side
  // by side), and two weeks of livestreams with their crew and pending sign-up counts.
  const [readyAt, graders, livestreams] = await Promise.all([
    groupRecords
      ? attempt("groups", failed, () => loadReadyAt(groupRecords[0].map((record) => record.id)))
      : Promise.resolve(null),
    groupRecords ? attempt("graders", failed, () => loadRequiredFinalCutGraders()) : Promise.resolve(null),
    calendarBase
      ? attempt("calendar", failed, () =>
          prisma.livestreamEvent.findMany({
            where: {
              status: { not: "CANCELLED" },
              startsAt: { gte: parseDateKeyUtc(todayKey), lt: parseDateKeyUtc(addDaysToDateKey(endKey, 1)) }
            },
            select: {
              id: true,
              title: true,
              startsAt: true,
              capacity: true,
              _count: { select: { attendees: true, signups: { where: { status: "PENDING" } } } }
            },
            orderBy: { startsAt: "asc" }
          })
        )
      : Promise.resolve(null)
  ]);

  const groups =
    groupRecords && readyAt && cycleNumber !== null
      ? buildAllCyclesPart(groupRecords[0], groupRecords[1], readyAt, viewer, cycles ?? [], cycleNumber, now, graders)
      : null;
  const calendar =
    calendarBase && livestreams
      ? buildCalendarPart(
          { overrides: calendarBase[0], entries: calendarBase[1], queued: calendarBase[2], livestreams },
          todayKey
        )
      : null;
  if (cycles === null && !failed.includes("groups")) failed.push("groups");

  return {
    cycleNumber,
    needs: orderNeeds(
      [
        ...(groups?.needs ?? []),
        ...(extensions ?? []),
        ...(participation ?? []),
        ...(access ?? []),
        ...(livestreamSignups ?? []),
        ...(calendar?.needs ?? [])
      ],
      now
    ),
    overview: groups?.overview ?? null,
    reviewQueue: groups?.reviewQueue ?? null,
    gradingQueue: groups?.gradingQueue ?? null,
    gradersLoaded: graders !== null,
    activity: groups?.activity ?? null,
    deadlines: cycles && cycleNumber !== null ? buildWeekDeadlines(cycles, todayKey, cycleNumber) : null,
    events: calendar?.events ?? null,
    showDays: calendar?.showDays ?? null,
    livestreams: calendar?.livestreams ?? null,
    failed: [...new Set(failed)]
  };
}
