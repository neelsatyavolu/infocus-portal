import { calculateExtensionsRemaining, STARTING_EXTENSION_DAYS } from "@/src/lib/extensions";
import {
  buildUserNameCandidates,
  extractMentionUserIds,
  groupMembersIncludeUserName
} from "@/src/lib/group-members";
import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { loadPackageProgressData } from "@/src/server/package-progress-data";
import { loadStageCommentUnread } from "@/src/server/package-stage-comments";
import { loadGradebookExtras } from "@/src/server/student-gradebook";
import { buildGradeSummary } from "@/src/server/student-grade-summary";

export type DashboardStage = {
  key: "proofOfContact" | "aRollBRoll" | "initialCut" | "finalCut";
  label: string;
  done: boolean;
  dueDate: string | null;
};

export type DashboardUpNext = {
  cycleNumber: number;
  groupTopic: string | null;
  finalCutDate: string | null;
  producerName: string | null;
  memberNames: string[];
  checkInsDone: number;
  checkInsTotal: number;
  stages: DashboardStage[];
};

export type DashboardWeekDay = {
  weekday: string;
  points: number | null;
  maxPoints: number;
};

export type DashboardActivityEntry = {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  initials: string;
  verb: string;
  subject: string | null;
  createdAt: string;
};

export type DashboardData = {
  upNext: DashboardUpNext | null;
  activity: DashboardActivityEntry[];
};

export type StudentDashboardSnapshot = {
  letter: string | null;
  percentage: number | null;
  packages: { earned: number; possible: number };
  participation: { earned: number; possible: number };
  livestreamHours: number;
  requiredLivestreamHours: number;
  livestreamPoints: number | null;
  semesterLabel: string;
  thisWeek: {
    label: string;
    earned: number;
    possible: number;
    days: DashboardWeekDay[];
  } | null;
  extensionsRemaining: number;
  extensionBank: number;
  unreadFeedback: number;
};

export function snapshotPackageTotals(
  finalCutPoints: Array<number | null>,
  checkInPoints: Array<number | null>,
  checkInPossible?: Array<number | null>
) {
  const finals = sumGraded(finalCutPoints);
  const checks = sumGraded(checkInPoints);
  const checkPossible = checkInPoints.reduce<number>((total, earned, index) => {
    if (earned === null) {
      return total;
    }
    return total + (checkInPossible?.[index] ?? MAX_CHECK_IN_POINTS_PER_CYCLE);
  }, 0);
  return {
    earned: finals.earned + checks.earned,
    possible: finals.count * MAX_FINAL_CUT_POINTS + checkPossible
  };
}

function sumGraded(values: Array<number | null>) {
  return values.reduce(
    (acc, value) => {
      if (value === null) return acc;
      return { earned: acc.earned + value, count: acc.count + 1 };
    },
    { earned: 0, count: 0 }
  );
}

export function pickCurrentParticipationWeek<T extends { weekStart: string }>(
  weeks: T[],
  today = new Date().toISOString().slice(0, 10)
): T | null {
  if (weeks.length === 0) {
    return null;
  }

  const current = weeks.findIndex((week, index) => {
    const nextStart = weeks[index + 1]?.weekStart;
    return week.weekStart <= today && (!nextStart || nextStart > today);
  });

  return weeks[current >= 0 ? current : 0] ?? null;
}

const STAGE_DEFS: Array<{
  key: DashboardStage["key"];
  label: string;
  dateField: "proofOfContactDate" | "aRollBRollDate" | "initialCutDate" | "finalCutDate";
}> = [
  { key: "proofOfContact", label: "Brainstorming & Proof of Contact", dateField: "proofOfContactDate" },
  { key: "aRollBRoll", label: "A-roll / B-roll", dateField: "aRollBRollDate" },
  { key: "initialCut", label: "Initial Cut", dateField: "initialCutDate" },
  { key: "finalCut", label: "Final Cut", dateField: "finalCutDate" }
];

function buildInitials(name: string | null, email: string | null): string {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) return "??";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

function activityVerb(type: string): string {
  switch (type) {
    case "media.upload.initialized":
      return "uploaded";
    case "media.upload.ready":
      return "published";
    case "media.version.upload.initialized":
      return "uploaded a new version of";
    case "media.version.upload.ready":
      return "published a new version of";
    case "comment.created":
    case "comment.created.guest":
      return "commented on";
    case "comment.reply":
    case "comment.reply.guest":
      return "replied on";
    case "comment.resolved":
      return "resolved a comment on";
    case "approval.changed":
      return "updated approval on";
    default:
      return "updated";
  }
}

export async function getDashboardData({
  userId,
  userName,
  userEmail,
  workspaceIds
}: {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  workspaceIds: string[];
}): Promise<DashboardData> {
  let upNext: DashboardUpNext | null = null;

  try {
    const progress = await loadPackageProgressData();
    const candidates = buildUserNameCandidates(userName, userEmail);

    const myRow =
      progress.rows.find((row) =>
        extractMentionUserIds(row.groupMembers).includes(userId)
      ) ??
      (candidates.size > 0
        ? progress.rows.find((row) => groupMembersIncludeUserName(row.groupMembers, candidates))
        : null);

    if (myRow) {
      const cycleMeta = await prisma.packageCycle.findUnique({
        where: { cycleNumber: progress.activeCycleNumber },
        select: {
          proofOfContactDate: true,
          aRollBRollDate: true,
          initialCutDate: true,
          finalCutDate: true
        }
      });

      const checkIns = [
        Boolean(myRow.pitching),
        Boolean(myRow.proofOfContact),
        Boolean(myRow.aRollBRoll),
        Boolean(myRow.initialCut)
      ];

      upNext = {
        cycleNumber: progress.activeCycleNumber,
        groupTopic: myRow.groupTopic?.trim() || null,
        finalCutDate: cycleMeta?.finalCutDate?.toISOString() ?? null,
        producerName:
          myRow.assignedProducer?.name?.trim() ||
          myRow.assignedExecutiveProducer?.name?.trim() ||
          null,
        memberNames: myRow.members
          .map((member) => member.name?.trim() || member.email?.split("@")[0] || "")
          .filter(Boolean),
        checkInsDone: checkIns.filter(Boolean).length,
        checkInsTotal: checkIns.length,
        stages: STAGE_DEFS.map((stage) => ({
          key: stage.key,
          label: stage.label,
          done: Boolean(myRow[stage.key]),
          dueDate: cycleMeta?.[stage.dateField]?.toISOString() ?? null
        }))
      };
    }
  } catch (err) {
    console.error("Failed to load package progress for dashboard:", err);
    upNext = null;
  }

  let activity: DashboardActivityEntry[] = [];

  if (workspaceIds.length > 0) {
    try {
      const events = await prisma.activityEvent.findMany({
        where: { workspaceId: { in: workspaceIds }, actorId: userId },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          actor: { select: { id: true, name: true, nickname: true, email: true } },
          mediaItem: { select: { title: true } },
          mediaVersion: {
            select: { versionNumber: true, mediaItem: { select: { title: true } } }
          }
        }
      });

      activity = events.map((event) => {
        const actorName = event.actor ? userDisplayName(event.actor) || event.actor.name : null;
        const actorEmail = event.actor?.email ?? null;
        const subjectTitle =
          event.mediaVersion?.mediaItem?.title ?? event.mediaItem?.title ?? null;
        const subjectVersion = event.mediaVersion?.versionNumber
          ? ` v${event.mediaVersion.versionNumber}`
          : "";
        return {
          id: event.id,
          actorName,
          actorEmail,
          initials: buildInitials(actorName, actorEmail),
          verb: activityVerb(event.type),
          subject: subjectTitle ? `${subjectTitle}${subjectVersion}` : null,
          createdAt: event.createdAt.toISOString()
        };
      });
    } catch (err) {
      console.error("Failed to load activity events for dashboard:", err);
      activity = [];
    }
  }

  return { upNext, activity };
}

export async function loadStudentDashboardSnapshot(userId: string): Promise<StudentDashboardSnapshot> {
  const gradeSummary = await buildGradeSummary(userId);
  const [extras, extensionRows, unread] = await Promise.all([
    loadGradebookExtras(userId, gradeSummary.cycleNumbers, gradeSummary.checkInStages),
    prisma.packageGrade.findMany({
      where: { userId },
      select: { extensionDaysApplied: true, extensionExempt: true, freeExtensionDays: true }
    }),
    loadStageCommentUnread(userId)
  ]);
  const thisWeek = pickCurrentParticipationWeek(extras.weeks);

  return {
    letter: gradeSummary.letter,
    percentage: gradeSummary.percentage,
    packages: snapshotPackageTotals(
      gradeSummary.countedFinalCutPoints,
      gradeSummary.countedCheckInPoints,
      gradeSummary.countedCheckInPossible
    ),
    participation: {
      earned: gradeSummary.participationEarned,
      possible: gradeSummary.participationPossible
    },
    livestreamHours: extras.livestreamHours,
    requiredLivestreamHours: extras.requiredLivestreamHours,
    livestreamPoints: gradeSummary.livestreamPoints,
    semesterLabel: extras.semester.label,
    thisWeek: thisWeek
      ? {
          label: thisWeek.label,
          earned: thisWeek.earned,
          possible: thisWeek.fullPossible,
          days: thisWeek.days
            .filter((day) => day.maxPoints > 0)
            .map((day) => ({
              weekday: day.weekday,
              points: day.points,
              maxPoints: day.maxPoints
            }))
        }
      : null,
    extensionsRemaining: calculateExtensionsRemaining(extensionRows),
    extensionBank: STARTING_EXTENSION_DAYS,
    unreadFeedback: Object.values(unread).reduce((sum, count) => sum + count, 0)
  };
}

export function formatRelativeTime(dateIso: string, now: Date = new Date()): string {
  const then = new Date(dateIso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return "—";
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD} d ago`;
  return then.toLocaleDateString();
}

export function formatStageDueLabel(dueDate: string | null, now: Date = new Date()): string | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const diffDays = Math.round((dueUtc - todayUtc) / 86_400_000);
  const dateLabel = due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
  if (diffDays === 0) return `Due ${dateLabel} · today`;
  if (diffDays > 0) return `Due ${dateLabel} · in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  return `Due ${dateLabel} · ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;
}
