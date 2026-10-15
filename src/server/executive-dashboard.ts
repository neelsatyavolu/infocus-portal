import type { PlatformRole, Prisma } from "@prisma/client";
import { visibleGroupRows } from "@/components/groups/group-attention";
import { buildClassOverview, groupNeedItem, type ClassOverview, type GroupReadySince } from "@/components/home/executive-groups";
import { orderNeeds, type NeedItem } from "@/components/home/executive-needs";
import { buildDayModels, dateFromKey } from "@/components/master-calendar/calendar-model";
import { buildGroupRowView, type CycleDates, type GroupRow } from "@/app/(app)/groups/group-row-model";
import { buildBoardDeadlines } from "@/src/lib/class-board";
import { deadlineClosesAt, pacificDateKey } from "@/src/lib/deadlines";
import { remainingFromApproval } from "@/src/lib/package-approval";
import { serializeProofs } from "@/src/lib/package-brainstorm";
import { approvedExtensionDaysFor, extensionRequestAwaitsUser } from "@/src/lib/package-extensions";
import { canGradeFinalCut, gradersDoneWithGroup } from "@/src/lib/package-final-cut-scores";
import { membersAwaitingFinalCutScores } from "@/src/lib/package-revisions";
import { currentCutRevisionStage } from "@/src/lib/initial-cut-review-versions";
import { APPROVAL_COMMENT_PREFIX } from "@/src/lib/package-stage-comments";
import { earlyStageNeedsChanges } from "@/src/lib/package-stage-status";
import { buildPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { addDaysToDateKey, formatShowDateShort, parseDateKeyUtc } from "@/src/lib/show-assignment";
import { ASSOCIATE_REVIEW_AUDIT } from "@/src/server/associate-review-history";
import { mayDecideExtensionRequest } from "@/src/server/extension-requests";
import { canManageLivestreams } from "@/src/server/livestream-access";
import { activeCycleNumberFor, ensurePackageProgressDefaults } from "@/src/server/package-progress-data";

/**
 * The executive Home (/dashboard for executives, the adviser and super admin): what waits on the
 * viewer, the cycle's groups by stage, and the next two weeks. Built from the loaders and rules
 * the pages use (the Groups row view, the sidebar's counts, the Master Calendar's day model).
 * Queries run in three small waves (at most 5 at once: the Prisma pool on Workers); each part
 * fails on its own (logged, listed in `failed`) and the rest still renders.
 */

export type ExecutiveViewer = { userId: string; role: PlatformRole | null };

export type ExecutivePart = "cycle" | "groups" | "extensions" | "participation" | "access" | "livestreams" | "calendar";

export type WeekDeadline = { key: string; label: string; dateKey: string; dateLabel: string; daysUntil: number };
export type WeekEvent = { key: string; kind: "show" | "livestream"; title: string; dateLabel: string; href: string };

export type ExecutiveDashboard = {
  cycleNumber: number | null;
  /** Ordered by urgency (orderNeeds). */
  needs: NeedItem[];
  overview: ClassOverview | null;
  /** Stage deadlines in the next 14 days; null when the cycles failed to load. */
  deadlines: WeekDeadline[] | null;
  /** Shows and livestreams in the next 7 days; null when the calendar failed to load. */
  events: WeekEvent[] | null;
  failed: ExecutivePart[];
};

const WEEK_DAYS = 7;
const DEADLINE_DAYS = 14;

// ---------------------------------------------------------------------------------------------
// Groups: the Groups page's row fields (loadPackageProgressData), without names or producer lists.

const GROUP_SELECT = {
  id: true,
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
  brainstormDocUrl: true,
  initialCutMediaItemId: true,
  finalCutMediaItemId: true,
  queuedForAirAt: true,
  awaitingRevisedInitialCut: true,
  members: { select: { userId: true } },
  proofOfContacts: { select: { id: true, slot: true, fileName: true, mimeType: true, updatedAt: true } },
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
type FinalCutGrade = { userId: string; awardedFinalCutPoints: number | null; revisionCount: number };
type Cycle = Awaited<ReturnType<typeof ensurePackageProgressDefaults>>[number];

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

function toGroupRow(record: GroupRecord, readyAt: Map<string, Date>, finalCutGrades: FinalCutGrade[]) {
  const memberIds = record.members.map((member) => member.userId);
  const officiallyGraded = new Set(finalCutGrades.map((grade) => grade.userId));
  const cutVersion = record.initialCutMediaItem?.currentVersion ?? null;
  const aRoll = record.stageMedia[0] ?? null;
  const reviewReadyAt = {
    brainstorming: iso(readyAt.get(`${record.id}:brainstorming`)),
    "a-roll": iso(readyAt.get(`${record.id}:${aRoll?.mediaItem.currentVersionId}`) ?? aRoll?.createdAt),
    "initial-cut": iso(readyAt.get(`${record.id}:${cutVersion?.id}`) ?? cutVersion?.createdAt)
  };
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
    finalCutGraded:
      Boolean(record.finalCutMediaItemId) && memberIds.length > 0 && memberIds.every((id) => officiallyGraded.has(id)),
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
  return { row, readySince };
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
 * The Groups page's rows for this viewer (visibleGroupRows, buildGroupRowView), the ones waiting
 * on them as "Needs you" rows, and the cycle's overview.
 */
export function buildGroupsPart(
  records: GroupRecord[],
  finalCutGrades: FinalCutGrade[],
  readyAt: Map<string, Date>,
  viewer: ExecutiveViewer,
  dates: CycleDates | null,
  now: Date
) {
  const mapped = records.map((record) => toGroupRow(record, readyAt, finalCutGrades));
  const readyById = new Map(mapped.map(({ row, readySince }) => [row.id, readySince]));
  const rows = visibleGroupRows(
    mapped.map(({ row }) => row),
    { platformRole: viewer.role, currentUserId: viewer.userId, producerCategory: null }
  );
  const ctx = { platformRole: viewer.role, currentUserId: viewer.userId, cycleDates: dates, now };
  const views = rows.map((row, index) => buildGroupRowView(row, index, ctx));
  const needs = views.flatMap((view) => {
    const item = groupNeedItem(view, readyById.get(view.row.id) ?? {}, dates);
    return item ? [item] : [];
  });
  return { needs, overview: buildClassOverview(views) };
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

/** Participation changes from other producers (the sidebar's People count). */
async function loadParticipationNeeds(viewer: ExecutiveViewer) {
  const pending = await prisma.participationGradeRequest.aggregate({
    where: { status: "PENDING", requestedById: { not: viewer.userId } },
    _count: { _all: true },
    _min: { createdAt: true }
  });
  return countNeed("participation", pending._count._all, pending._min.createdAt, {
    title: "Participation changes",
    need: (count) => `${count} to approve`,
    href: "/participation"
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

// ---------------------------------------------------------------------------------------------
// Calendar: the next 7 days of the Master Calendar and the Publishing Queue.

type CalendarRecords = {
  overrides: Array<{ date: string; kind: string; label: string }>;
  entries: Array<{ date: string; content: string }>;
  queued: Array<{ id: string; groupTopic: string; cycleNumber: number; queuedForShowDate: string | null }>;
  livestreams: Array<{ id: string; title: string; startsAt: Date }>;
};

function weekdayKeys(todayKey: string) {
  return Array.from({ length: WEEK_DAYS }, (_, offset) => addDaysToDateKey(todayKey, offset)).filter((key) => {
    const weekday = parseDateKeyUtc(key).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  });
}

/** Ends at 11:59 PM Pacific that day, like a stage deadline. */
function endOfDay(dateKey: string) {
  return deadlineClosesAt(parseDateKeyUtc(dateKey)).toISOString();
}

/**
 * Show and PA days in the next week, through the Master Calendar's own day model (anchors and
 * PA announcers needed, packages queued), and the week's shows and livestreams.
 */
export function buildCalendarPart(records: CalendarRecords, todayKey: string) {
  const keys = weekdayKeys(todayKey);
  const overrides = new Map(records.overrides.map((row) => [row.date, { kind: row.kind as ScheduleKind, label: row.label }]));
  const days = buildDayModels({
    weeks: [keys.map(dateFromKey)],
    entries: Object.fromEntries(records.entries.map((entry) => [entry.date, entry.content])),
    scheduleDays: keys.map((key) => resolveScheduleDay(key, overrides)),
    queuedPackages: records.queued.map((row) => ({
      id: row.id,
      groupTopic: row.groupTopic,
      cycleNumber: row.cycleNumber,
      date: row.queuedForShowDate
    })),
    showManagers: {},
    todayKey,
    // Everyone on this Home can edit the calendar, so the "needed" flags apply.
    canEdit: true
  });

  const needs: NeedItem[] = days.flatMap((day) => {
    const date = formatShowDateShort(day.dateKey);
    const dueAt = endOfDay(day.dateKey);
    const items: NeedItem[] = [];
    if (day.anchorsNeeded) {
      items.push({
        key: `anchors-${day.dateKey}`,
        kind: "anchors",
        title: `Anchors for ${date}`,
        need: day.anchors.length === 0 ? "None set" : `${day.anchors.length} of 2 set`,
        href: "/master-calendar",
        dueAt,
        waitingSince: null
      });
    }
    if (day.paNeeded) {
      items.push({
        key: `announcers-${day.dateKey}`,
        kind: "announcers",
        title: `PA announcers for ${date}`,
        need: day.paNames.length === 0 ? "None set" : `${day.paNames.length} of 2 set`,
        href: "/master-calendar",
        dueAt,
        waitingSince: null
      });
    }
    if (day.kind === "SHOW" && day.queue.length === 0) {
      items.push({
        key: `queue-${day.dateKey}`,
        kind: "queue",
        title: `Package for ${date}`,
        need: "Nothing queued for this show",
        href: "/publishing-queue",
        dueAt,
        waitingSince: null
      });
    }
    return items;
  });

  const shows: Array<WeekEvent & { at: number }> = days
    .filter((day) => day.kind === "SHOW")
    .map((day) => ({
      key: `show-${day.dateKey}`,
      kind: "show",
      title: day.specialLabel ? `Show · ${day.specialLabel}` : "Show",
      dateLabel: formatShowDateShort(day.dateKey),
      href: "/publishing-queue",
      at: parseDateKeyUtc(day.dateKey).getTime()
    }));
  const livestreams: Array<WeekEvent & { at: number }> = records.livestreams.map((event) => ({
    key: `livestream-${event.id}`,
    kind: "livestream",
    title: event.title,
    dateLabel: event.startsAt.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles"
    }),
    href: "/livestreams",
    at: parseDateKeyUtc(pacificDateKey(event.startsAt)).getTime()
  }));
  const events = [...shows, ...livestreams]
    .sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "show" ? -1 : 1))
    .map(({ key, kind, title, dateLabel, href }) => ({ key, kind, title, dateLabel, href }));
  return { needs, events };
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
  const weekEndKey = addDaysToDateKey(todayKey, WEEK_DAYS);

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

  // Wave 2 (5): the cycle's roster and Final Cut grades, and the week's calendar.
  const [groupRecords, calendarBase] = await Promise.all([
    cycleNumber === null
      ? Promise.resolve(null)
      : attempt("groups", failed, () =>
          Promise.all([
            prisma.packageProgressRow.findMany({ where: { cycleNumber }, orderBy: { rowOrder: "asc" }, select: GROUP_SELECT }),
            canGradeFinalCut(viewer.role)
              ? prisma.packageGrade.findMany({
                  where: { cycleNumber, awardedFinalCutPoints: { not: null } },
                  select: { userId: true, awardedFinalCutPoints: true, revisionCount: true }
                })
              : Promise.resolve([] as FinalCutGrade[])
          ])
        ),
    attempt("calendar", failed, () =>
      Promise.all([
        prisma.schoolCalendarDay.findMany({
          where: { date: { gte: todayKey, lt: weekEndKey } },
          select: { date: true, kind: true, label: true }
        }),
        prisma.masterCalendarEntry.findMany({
          where: { date: { gte: todayKey, lt: weekEndKey } },
          select: { date: true, content: true }
        }),
        prisma.packageProgressRow.findMany({
          where: { queuedForAirAt: { not: null }, queuedForShowDate: { gte: todayKey, lt: weekEndKey } },
          select: { id: true, groupTopic: true, cycleNumber: true, queuedForShowDate: true }
        })
      ])
    )
  ]);

  // Wave 3 (2): when each group became ready, and the week's livestreams.
  const [readyAt, livestreams] = await Promise.all([
    groupRecords
      ? attempt("groups", failed, () => loadReadyAt(groupRecords[0].map((record) => record.id)))
      : Promise.resolve(null),
    calendarBase
      ? attempt("calendar", failed, () =>
          prisma.livestreamEvent.findMany({
            where: {
              status: { not: "CANCELLED" },
              startsAt: { gte: parseDateKeyUtc(todayKey), lt: parseDateKeyUtc(addDaysToDateKey(weekEndKey, 1)) }
            },
            select: { id: true, title: true, startsAt: true },
            orderBy: { startsAt: "asc" }
          })
        )
      : Promise.resolve(null)
  ]);

  const groups =
    groupRecords && readyAt
      ? buildGroupsPart(groupRecords[0], groupRecords[1], readyAt, viewer, cycleDatesOf(activeCycle), now)
      : null;
  const calendar =
    calendarBase && livestreams
      ? buildCalendarPart(
          {
            overrides: calendarBase[0],
            entries: calendarBase[1],
            queued: calendarBase[2],
            livestreams: livestreams.filter((event) => {
              const key = pacificDateKey(event.startsAt);
              return key >= todayKey && key < weekEndKey;
            })
          },
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
    deadlines: cycles && cycleNumber !== null ? buildWeekDeadlines(cycles, todayKey, cycleNumber) : null,
    events: calendar?.events ?? null,
    failed: [...new Set(failed)]
  };
}
