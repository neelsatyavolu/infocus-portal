import { recordAssociateReviewHistory } from "@/src/server/associate-review-history";
import { MediaStatus, type PlatformRole } from "@prisma/client";
import { hasPlatformRole, isExecutiveProducer } from "@/src/lib/platform-admin";
import {
  canGradeFinalCut,
  clampFinalCutScore,
  executiveGradeStatus
} from "@/src/lib/package-final-cut-scores";
import {
  applyLatePenalty,
  approvedExtensionDaysFor,
  calculateLatePenalty,
  effectiveDeadline
} from "@/src/lib/package-extensions";
import {
  CYCLE_STAGE_FOLDERS,
  studentCanUpload,
  studentStageUnlocked,
  type CycleStageSlug
} from "@/src/lib/package-cycle-gates";
import { associateReviewClosed, remainingFromApproval } from "@/src/lib/package-approval";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { applyInitialCutUpload, groupFolderName, initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import { versionApprovedInStage, versionsForReviewStage } from "@/src/lib/initial-cut-review-versions";
import { officialFinalCutPoints } from "@/src/lib/package-review-mail";
import {
  cycleGradesArePublished,
  normalizeCycleGradeFeedback,
  sharedGradeFeedback
} from "@/src/lib/package-cycle-grades";
import { sendGradeEmails } from "@/src/lib/email";
import { gradePercentage, gradeTotal } from "@/src/lib/package-grades";
import {
  capAwardedForRevision,
  isEligibleForSecondRevision,
  previewFinalCutOfficial
} from "@/src/lib/package-revisions";
import { resolvePlaybackUrl, resolveThumbnailUrl } from "@/src/lib/media-playback";
import { buildCycleStageNasPath, isNasStorageEnabled, nasMintUploadSession } from "@/src/lib/nas-storage";
import { parseClipComment } from "@/src/lib/package-clip-comments";
import { isRollKind, parseRollTitle, rollKindFolder, titledWithRollKind, type RollKind } from "@/src/lib/package-roll-kind";
import { prisma } from "@/src/lib/prisma";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";
import { getOrCreateApproval, loadApprovalView } from "@/src/server/package-approval-service";
import {
  allCycleStageStatuses,
  aRollFeedbackNeedsChanges,
  aRollUploadIsNew,
  emptyCycleStageStatusInput
} from "@/src/lib/package-stage-status";
import { APPROVAL_COMMENT_PREFIX, isApprovalComment } from "@/src/lib/package-stage-comments";
import { loadStageCommentUnread } from "@/src/server/package-stage-comments";
import { notifyARollUploaded, notifyFinalCutUploaded, notifyPackageReview } from "@/src/server/package-review-notify";
import { ensurePackageProgressDefaults, loadRequiredFinalCutGraders } from "@/src/server/package-progress-data";
import { ensureCycleMediaFolder } from "@/src/server/cycle-project-folders";

export function lastName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/);
  return parts[parts.length - 1] || "";
}

export async function resolveActiveCycleNumber(requested?: number | null) {
  const cycles = await ensurePackageProgressDefaults();
  if (requested && cycles.some((cycle) => cycle.cycleNumber === requested)) {
    return requested;
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    cycles.find((cycle) => {
      const finalCut = cycle.finalCutDate?.toISOString().slice(0, 10) ?? null;
      return !finalCut || finalCut >= today;
    })?.cycleNumber ??
    cycles[cycles.length - 1]?.cycleNumber ??
    1
  );
}

export async function loadStudentCycleRow(userId: string, cycleNumber: number) {
  return prisma.packageProgressRow.findFirst({
    where: { cycleNumber, members: { some: { userId } } },
    include: {
      members: { include: { user: { select: { id: true, name: true, nickname: true, email: true } } } },
      assignedProducer: { select: { id: true, name: true, nickname: true, email: true } },
      approval: {
        select: {
          stage: true,
          controversial: true,
          signoffs: { select: { userId: true, stage: true, approved: true, createdAt: true } }
        }
      },
      initialCutMediaItem: { include: { currentVersion: true, versions: { orderBy: { versionNumber: "asc" } } } },
      finalCutMediaItem: { include: { currentVersion: true } },
      stageMedia: {
        where: { stage: "a-roll" },
        include: { mediaItem: { include: { currentVersion: true } } }
      }
    }
  });
}

async function ensureCycleProject(cycleNumber: number) {
  const name = `Cycle ${cycleNumber}`;
  const existing = await prisma.project.findFirst({ where: { name } });
  if (existing) return existing;

  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!workspace) {
    throw new Error("NOT_FOUND");
  }

  return prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name,
      description: "System project for package-cycle student uploads"
    }
  });
}

function serializeCutVersions(item: {
  id: string;
  title: string;
  projectId?: string;
  currentVersion: Parameters<typeof serializeMedia>[0]["currentVersion"];
  versions?: Array<NonNullable<Parameters<typeof serializeMedia>[0]["currentVersion"]>>;
}) {
  const versions = (item.versions ?? []).filter(Boolean);
  const ordered = versions.length
    ? [...versions].sort((left, right) => right.versionNumber - left.versionNumber)
    : item.currentVersion
      ? [item.currentVersion]
      : [];
  return ordered.map((version) => serializeMedia({ ...item, currentVersion: version }));
}

function serializeMedia(item: {
  id: string;
  title: string;
  projectId?: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    status: MediaStatus;
    approvalStatus?: string | null;
    bunnyVideoId?: string | null;
    storageProvider?: string | null;
    nasPath?: string | null;
  } | null;
}) {
  const { rollKind, displayTitle } = parseRollTitle(item.title);
  return {
    id: item.id,
    title: displayTitle,
    rollKind,
    projectId: item.projectId ?? null,
    versionId: item.currentVersion?.id ?? null,
    versionNumber: item.currentVersion?.versionNumber ?? 1,
    status: item.currentVersion?.status ?? "UPLOADING",
    approvalStatus: item.currentVersion?.approvalStatus ?? "IN_REVIEW",
    approvedInStage: null as 1 | 2 | 3 | null,
    thumbnailUrl: null as string | null,
    playbackUrl: null as string | null,
    commentCount: 0,
    isNew: false,
    version: item.currentVersion
      ? {
          bunnyVideoId: item.currentVersion.bunnyVideoId ?? "",
          storageProvider: item.currentVersion.storageProvider,
          nasPath: item.currentVersion.nasPath,
          status: item.currentVersion.status
        }
      : null
  };
}

async function hydrateMediaCards(
  items: Array<ReturnType<typeof serializeMedia>>
): Promise<
  Array<
    Omit<ReturnType<typeof serializeMedia>, "version"> & {
      thumbnailUrl: string | null;
      playbackUrl: string | null;
      commentCount: number;
    }
  >
> {
  return Promise.all(
    items.map(async (item) => {
      const [thumbnailUrl, playbackUrl] = item.version
        ? await Promise.all([resolveThumbnailUrl(item.version), resolvePlaybackUrl(item.version)])
        : [null, null];
      return {
        id: item.id,
        title: item.title,
        rollKind: item.rollKind,
        projectId: item.projectId,
        versionId: item.versionId,
        versionNumber: item.versionNumber,
        status: item.status,
        approvalStatus: item.approvalStatus,
        approvedInStage: item.approvedInStage,
        thumbnailUrl,
        playbackUrl,
        commentCount: item.commentCount,
        isNew: item.isNew
      };
    })
  );
}

export type FinalCutGradePanel = {
  canGrade: boolean;
  complete: boolean;
  average: number | null;
  officialPoints: number | null;
  pendingCount: number;
  myPoints: number | null;
  viewerUserId: string;
  deadlineAt: string | null;
  turnedInAt: string | null;
  extensionDays: number;
  daysLate: number;
  penaltyMultiplier: number;
  blocksSecondRevision: boolean;
  revisionCount: number;
  secondRevisionEligible: boolean;
  qualityPoints: number | null;
  afterRevisionCap: number | null;
  revisionCapped: boolean;
  feedback: string;
  published: boolean;
  publishedAt: string | null;
  scores: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    points: number | null;
    required: boolean;
  }>;
};

async function loadFinalCutGradePanel(input: {
  rowId: string;
  role: PlatformRole | null;
  userId: string;
  officialPoints?: number | null;
}): Promise<FinalCutGradePanel> {
  const [graders, scores, row] = await Promise.all([
    loadRequiredFinalCutGraders(),
    prisma.packageFinalCutScore.findMany({
      where: { rowId: input.rowId },
      include: { grader: { select: { id: true, name: true, nickname: true, email: true } } }
    }),
    prisma.packageProgressRow.findUnique({
      where: { id: input.rowId },
      select: {
        cycleNumber: true,
        extension: true,
        finalCutMediaItem: { select: { createdAt: true } },
        extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } },
        members: { select: { userId: true } }
      }
    })
  ]);
  const [cycle, grades] = row
    ? await Promise.all([
        prisma.packageCycle.findUnique({
          where: { cycleNumber: row.cycleNumber },
          select: { finalCutDate: true }
        }),
        prisma.packageGrade.findMany({
          where: {
            cycleNumber: row.cycleNumber,
            userId: { in: row.members.map((member) => member.userId) }
          },
          select: {
            userId: true,
            revisionCount: true,
            awardedFinalCutPoints: true,
            finalCutPoints: true,
            turnedInDate: true,
            feedback: true,
            publishedAt: true
          }
        })
      ])
    : [null, []];
  const memberIds = row?.members.map((member) => member.userId) ?? [];
  const grade = grades[0] ?? null;
  const latestPublishedAt = grades.reduce<Date | null>((latest, entry) => {
    if (!entry.publishedAt) return latest;
    if (!latest || entry.publishedAt > latest) return entry.publishedAt;
    return latest;
  }, null);

  const status = executiveGradeStatus({
    requiredGraderIds: graders.map((grader) => grader.userId),
    scores: scores.map((score) => ({ graderUserId: score.graderUserId, points: score.points }))
  });
  const requiredIds = new Set(graders.map((grader) => grader.userId));
  const extras = scores.filter((score) => !requiredIds.has(score.graderUserId));
  const pointsByGrader = new Map(scores.map((score) => [score.graderUserId, score.points]));
  // Group panel shows the longest grant; per-member penalties are applied when grading.
  const extensionDays = approvedExtensionDaysFor(row);
  const deadline = effectiveDeadline(cycle?.finalCutDate ?? null, extensionDays);
  const turnedIn = grade?.turnedInDate ?? row?.finalCutMediaItem?.createdAt ?? null;
  const penalty = calculateLatePenalty(deadline, turnedIn);
  const revisionCount = grade?.revisionCount ?? 0;
  const preview = previewFinalCutOfficial({
    average: status.average,
    revisionCount: revisionCount > 0 ? revisionCount : 1,
    penaltyMultiplier: penalty.penaltyMultiplier
  });

  return {
    canGrade: canGradeFinalCut(input.role),
    complete: status.complete,
    average: status.average,
    officialPoints: input.officialPoints ?? grade?.finalCutPoints ?? preview.official,
    pendingCount: status.pendingIds.length,
    myPoints: pointsByGrader.get(input.userId) ?? null,
    viewerUserId: input.userId,
    deadlineAt: deadline?.toISOString() ?? null,
    turnedInAt: turnedIn?.toISOString() ?? null,
    extensionDays,
    daysLate: penalty.daysLate,
    penaltyMultiplier: penalty.penaltyMultiplier,
    blocksSecondRevision: penalty.blocksSecondRevision,
    revisionCount,
    secondRevisionEligible: isEligibleForSecondRevision(
      grade?.awardedFinalCutPoints ?? status.average,
      revisionCount
    ),
    qualityPoints: preview.quality,
    afterRevisionCap: preview.afterRevisionCap,
    revisionCapped: preview.revisionCapped,
    feedback: sharedGradeFeedback(grades),
    published: cycleGradesArePublished(grades, memberIds),
    publishedAt: latestPublishedAt?.toISOString() ?? null,
    scores: [
      ...graders.map((grader) => ({
        userId: grader.userId,
        name: userDisplayName(grader) || grader.name,
        email: grader.email,
        points: pointsByGrader.get(grader.userId) ?? null,
        required: true
      })),
      ...extras.map((score) => ({
        userId: score.graderUserId,
        name: userDisplayName(score.grader) || score.grader.name,
        email: score.grader.email,
        points: score.points,
        required: false
      }))
    ]
  };
}

export async function loadStudentNavGates(userId: string) {
  const [cycleNumber, unread] = await Promise.all([
    resolveActiveCycleNumber(null),
    loadStageCommentUnread(userId)
  ]);
  const locked = { "a-roll": false, "initial-cut": false, "final-cut": false };
  const row = await prisma.packageProgressRow.findFirst({
    where: { cycleNumber, members: { some: { userId } } },
    select: {
      proofOfContact: true,
      aRollBRoll: true,
      initialCut: true,
      awaitingRevisedInitialCut: true,
      initialCutMediaItemId: true,
      initialCutMediaItem: { select: { currentVersion: { select: { approvalStatus: true } } } },
      finalCutMediaItemId: true,
      brainstormDocUrl: true,
      queuedForAirAt: true,
      approval: {
        select: {
          stage: true,
          controversial: true,
          signoffs: { select: { userId: true, stage: true, approved: true } }
        }
      },
      _count: { select: { proofOfContacts: true } },
      stageMedia: {
        where: { stage: "a-roll" },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      stageComments: {
        where: { stage: "a-roll", NOT: { body: { startsWith: APPROVAL_COMMENT_PREFIX } } },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!row) {
    return {
      cycleNumber,
      hasRow: false,
      unlocked: locked,
      statuses: allCycleStageStatuses(emptyCycleStageStatusInput()),
      unread
    };
  }
  const approvalStage = row.approval?.stage ?? "DRAFT";
  const remainingExecutiveSignoffs = remainingFromApproval(row.approval);
  const approval = { stage: approvalStage };
  const statusInput = {
    proofOfContact: row.proofOfContact,
    proofCount: row._count.proofOfContacts,
    brainstormDocUrl: row.brainstormDocUrl,
    aRollBRoll: row.aRollBRoll,
    aRollHasMedia: row.stageMedia.length > 0,
    aRollNeedsChanges: aRollFeedbackNeedsChanges(
      row.aRollBRoll,
      row.stageComments.length > 0,
      row.stageComments[0]?.createdAt,
      row.stageMedia[0]?.createdAt
    ),
    initialCut: row.initialCut,
    initialCutHasMedia: Boolean(row.initialCutMediaItemId),
    awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
    initialCutNeedsRevisions: row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
    approvalStage,
    finalCutHasMedia: Boolean(row.finalCutMediaItemId),
    queuedForAir: Boolean(row.queuedForAirAt)
  };
  return {
    cycleNumber,
    hasRow: true,
    unlocked: {
      "a-roll": studentStageUnlocked("a-roll", row, approval),
      "initial-cut": studentStageUnlocked("initial-cut", row, approval),
      "final-cut": studentStageUnlocked("final-cut", row, approval)
    },
    statuses: allCycleStageStatuses(statusInput),
    remainingExecutiveSignoffs,
    unread
  };
}

export async function loadCycleStageView(input: {
  userId: string;
  role: PlatformRole | null;
  slug: CycleStageSlug;
  rowId?: string | null;
  cycleNumber?: number | null;
  reviewStage?: 1 | 2 | 3 | null;
}) {
  const platformProducer = hasPlatformRole(input.role, "ASSOCIATE_PRODUCER");
  const cycleNumber = input.rowId ? undefined : await resolveActiveCycleNumber(input.cycleNumber);

  const row = input.rowId
    ? await prisma.packageProgressRow.findUnique({
        where: { id: input.rowId },
        include: {
          members: { include: { user: { select: { id: true, name: true, nickname: true, email: true } } } },
          assignedProducer: { select: { id: true, name: true, nickname: true, email: true } },
          approval: {
            select: {
              stage: true,
              controversial: true,
              signoffs: { select: { userId: true, stage: true, approved: true, createdAt: true } }
            }
          },
          initialCutMediaItem: { include: { currentVersion: true, versions: { orderBy: { versionNumber: "asc" } } } },
          finalCutMediaItem: { include: { currentVersion: true } },
          stageMedia: {
            where: { stage: "a-roll" },
            include: { mediaItem: { include: { currentVersion: true } } }
          }
        }
      })
    : await loadStudentCycleRow(input.userId, cycleNumber!);

  if (!row) {
    return {
      empty: true as const,
      slug: input.slug,
      isProducer: platformProducer,
      canUpload: false,
      canComment: platformProducer
    };
  }

  const isMember = row.members.some((member) => member.userId === input.userId);
  if (!platformProducer && !isMember) {
    throw new Error("FORBIDDEN");
  }

  // Student cycle URLs (no rowId) treat an associate who is on the roster as a student.
  // Associates only get producer tools on packages they are assigned to — never their own.
  const isProducer =
    Boolean(input.rowId) && producerMayActOnPackage(input.role, input.userId, row);
  const approvalStage = row.approval?.stage ?? "DRAFT";
  const unlocked = isProducer || studentStageUnlocked(input.slug, row, { stage: approvalStage });
  const memberIds = row.members.map((member) => member.userId);
  const existingGrade =
    input.slug === "final-cut"
      ? await prisma.packageGrade.findFirst({
          where: {
            cycleNumber: row.cycleNumber,
            userId: { in: memberIds },
            awardedFinalCutPoints: { not: null }
          },
          select: { awardedFinalCutPoints: true, revisionCount: true, finalCutPoints: true }
        })
      : null;
  const allowSecondFinalCut = isEligibleForSecondRevision(
    existingGrade?.awardedFinalCutPoints ?? null,
    existingGrade?.revisionCount ?? 0
  );
  const canUpload =
    isMember &&
    studentCanUpload(input.slug, row, { stage: approvalStage }, { allowSecondFinalCut }) &&
    (input.slug !== "initial-cut" || approvalStage !== "APPROVED");

  const rawMedia =
    input.slug === "a-roll"
      ? row.stageMedia.map((link) => serializeMedia(link.mediaItem))
      : input.slug === "initial-cut" && row.initialCutMediaItem
        ? serializeCutVersions(row.initialCutMediaItem).filter((item) => {
            if (!input.reviewStage || !row.initialCutMediaItem) return true;
            const kept = new Set(
              versionsForReviewStage(
                row.initialCutMediaItem.versions ?? [],
                row.approval?.signoffs ?? [],
                input.reviewStage
              ).map((version) => version.id)
            );
            return item.versionId ? kept.has(item.versionId) : false;
          })
        : input.slug === "final-cut" && row.finalCutMediaItem
          ? [serializeMedia(row.finalCutMediaItem)]
          : [];
  const stageNotes =
    input.slug === "a-roll" || rawMedia.length > 0
      ? await prisma.packageStageComment.findMany({
          where: { rowId: row.id, stage: input.slug },
          select: { body: true, createdAt: true }
        })
      : [];
  if (rawMedia.length > 0) {
    const countByClip = new Map<string, number>();
    for (const note of stageNotes) {
      const clipId = parseClipComment(note.body).mediaItemId;
      if (!clipId) continue;
      countByClip.set(clipId, (countByClip.get(clipId) ?? 0) + 1);
    }
    for (const item of rawMedia) {
      item.commentCount = countByClip.get(item.id) ?? 0;
    }
  }
  const revisionNotes = stageNotes.filter((note) => !isApprovalComment(note.body));
  const latestFeedbackAt = revisionNotes.reduce<Date | null>((latest, note) => {
    if (!latest || note.createdAt > latest) return note.createdAt;
    return latest;
  }, null);
  const latestFootageAt = row.stageMedia.reduce<Date | null>((latest, link) => {
    if (!latest || link.createdAt > latest) return link.createdAt;
    return latest;
  }, null);
  const aRollNeedsChanges =
    input.slug === "a-roll" &&
    aRollFeedbackNeedsChanges(row.aRollBRoll, revisionNotes.length > 0, latestFeedbackAt, latestFootageAt);
  if (input.slug === "a-roll" && isProducer) {
    const uploadedAtById = new Map(row.stageMedia.map((link) => [link.mediaItem.id, link.createdAt]));
    for (const item of rawMedia) {
      item.isNew = aRollUploadIsNew(row.aRollBRoll, latestFeedbackAt, uploadedAtById.get(item.id) ?? null);
    }
  }
  const reviewVersionIds = rawMedia.map((item) => item.versionId).filter((id): id is string => Boolean(id));
  if (input.slug === "initial-cut" && reviewVersionIds.length > 0) {
    const reviewComments = await prisma.reviewComment.groupBy({
      by: ["mediaVersionId"],
      where: { mediaVersionId: { in: reviewVersionIds } },
      _count: { _all: true }
    });
    const countByVersion = new Map(reviewComments.map((row) => [row.mediaVersionId, row._count._all]));
    for (const item of rawMedia) {
      if (!item.versionId) continue;
      item.commentCount = countByVersion.get(item.versionId) ?? 0;
    }
  }
  const media = await hydrateMediaCards(rawMedia);
  if (input.slug === "initial-cut") {
    const cutVersions = row.initialCutMediaItem?.versions ?? [];
    const signoffs = row.approval?.signoffs ?? [];
    for (const item of media) {
      item.title = initialCutVersionTitle(item.versionNumber);
      item.approvedInStage = item.versionId
        ? versionApprovedInStage(item.versionId, cutVersions, signoffs)
        : null;
    }
  }
  if (input.slug === "a-roll") {
    media.sort((left, right) => {
      const rank = (kind: "a-roll" | "b-roll" | null) => (kind === "a-roll" ? 0 : kind === "b-roll" ? 1 : 2);
      return rank(left.rollKind) - rank(right.rollKind) || left.title.localeCompare(right.title);
    });
  }

  const finalCutGrade =
    input.slug === "final-cut"
      ? await loadFinalCutGradePanel({
          rowId: row.id,
          role: input.role,
          userId: input.userId,
          officialPoints: existingGrade?.finalCutPoints ?? null
        })
      : null;

  const cutApproval = isProducer && input.slug === "initial-cut"
    ? await loadApprovalView(row.id, {
        userId: input.userId, role: input.role,
        email: (await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }))?.email ?? null
      })
    : null;

  return {
    empty: false as const,
    slug: input.slug,
    isProducer,
    unlocked,
    canUpload,
    allowSecondFinalCut,
    canComment:
      isProducer && !(input.slug === "initial-cut" && associateReviewClosed(input.role, approvalStage)),
    cutApproval,
    canApproveAroll: isProducer && input.slug === "a-roll" && !row.aRollBRoll,
    canGradeFinalCut: canGradeFinalCut(input.role),
    finalCutGrade,
    row: {
      id: row.id,
      cycleNumber: row.cycleNumber,
      groupTopic: row.groupTopic,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      aRollNeedsChanges,
      initialCut: row.initialCut,
      finalCut: row.finalCut,
      awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
      initialCutNeedsRevisions:
        row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
      queuedForAirAt: row.queuedForAirAt?.toISOString() ?? null,
      approvalStage,
      remainingExecutiveSignoffs: remainingFromApproval(row.approval),
      assignedProducer: row.assignedProducer
        ? { id: row.assignedProducer.id, ...labeledUser(row.assignedProducer) }
        : null,
      members: row.members.map((member) => ({
        userId: member.user.id,
        ...labeledUser(member.user)
      }))
    },
    media
  };
}

export async function initCycleStageUpload(input: {
  userId: string;
  role: PlatformRole | null;
  rowId: string;
  slug: CycleStageSlug;
  title: string;
  fileName: string;
  rollKind?: RollKind | null;
}) {
  const view = await loadCycleStageView({
    userId: input.userId,
    role: input.role,
    slug: input.slug,
    rowId: input.rowId
  });
  if (view.empty || !view.canUpload) {
    throw new Error("FORBIDDEN");
  }

  const row = await prisma.packageProgressRow.findUniqueOrThrow({
    where: { id: input.rowId },
    include: {
      members: { include: { user: { select: { name: true, nickname: true } } } },
      initialCutMediaItem: { include: { currentVersion: true } },
      approval: { select: { stage: true } }
    }
  });

  if (input.slug === "final-cut" && row.finalCutMediaItemId) {
    const existingGrade = await prisma.packageGrade.findFirst({
      where: {
        cycleNumber: row.cycleNumber,
        userId: { in: row.members.map((member) => member.userId) },
        awardedFinalCutPoints: { not: null }
      },
      select: { awardedFinalCutPoints: true, revisionCount: true }
    });
    if (
      !isEligibleForSecondRevision(
        existingGrade?.awardedFinalCutPoints ?? null,
        existingGrade?.revisionCount ?? 0
      )
    ) {
      throw new Error("CONFLICT");
    }
  }

  const project = await ensureCycleProject(row.cycleNumber);
  const groupName = groupFolderName(
    row.groupTopic,
    row.members.map((member) => lastName(member.user.name))
  );
  if (input.slug === "a-roll" && !isRollKind(input.rollKind)) {
    throw new Error("BAD_REQUEST");
  }
  const rollKind = input.slug === "a-roll" && isRollKind(input.rollKind) ? input.rollKind : null;
  const nextVersion =
    input.slug === "initial-cut" && row.initialCutMediaItemId
      ? (row.initialCutMediaItem?.currentVersion?.versionNumber ?? 1) + 1
      : 1;
  const mediaTitle =
    input.slug === "initial-cut"
      ? initialCutVersionTitle(nextVersion)
      : rollKind
        ? titledWithRollKind(input.title, rollKind)
        : input.title;
  const stageFolder = rollKind
    ? `${CYCLE_STAGE_FOLDERS["a-roll"]}/${rollKindFolder(rollKind)}`
    : CYCLE_STAGE_FOLDERS[input.slug];

  if (input.slug === "initial-cut" && row.initialCutMediaItemId) {
    const transition = applyInitialCutUpload({
      currentStage: row.approval?.stage ?? "DRAFT",
      awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
      nextVersionNumber: nextVersion
    });
    if (!transition.ok) {
      throw new Error("CONFLICT");
    }

    if (!isNasStorageEnabled()) {
      throw new Error("BAD_REQUEST");
    }

    const nasPath = buildCycleStageNasPath({
      cycleNumber: row.cycleNumber,
      groupName,
      stageFolder,
      mediaTitle,
      versionNumber: nextVersion,
      fileName: input.fileName
    });
    const nasSession = await nasMintUploadSession(nasPath);
    const version = await prisma.mediaVersion.create({
      data: {
        mediaItemId: row.initialCutMediaItemId,
        versionNumber: nextVersion,
        bunnyVideoId: nasSession.videoId,
        bunnyLibraryId: "nas",
        storageProvider: "NAS",
        nasPath: nasSession.path,
        uploadSignature: nasSession.signature,
        status: "UPLOADING",
        createdById: input.userId
      }
    });
    const folder = await ensureCycleMediaFolder({
      projectId: project.id,
      groupName,
      stageFolder,
      createdById: input.userId
    });
    await prisma.mediaItem.update({
      where: { id: row.initialCutMediaItemId },
      data: { title: mediaTitle, folderId: folder.id }
    });

    return {
      mediaId: row.initialCutMediaItemId,
      versionId: version.id,
      nextVersion,
      upload: nasSession
    };
  }

  if (!isNasStorageEnabled()) {
    throw new Error("BAD_REQUEST");
  }

  const nasPath = buildCycleStageNasPath({
    cycleNumber: row.cycleNumber,
    groupName,
    stageFolder,
    mediaTitle,
    versionNumber: 1,
    fileName: input.fileName
  });
  const nasSession = await nasMintUploadSession(nasPath);

  const folder = await ensureCycleMediaFolder({
    projectId: project.id,
    groupName,
    stageFolder,
    createdById: input.userId
  });

  const created = await prisma.$transaction(async (tx) => {
    const mediaItem = await tx.mediaItem.create({
      data: {
        projectId: project.id,
        title: mediaTitle,
        folderId: folder.id,
        createdById: input.userId
      }
    });
    const version = await tx.mediaVersion.create({
      data: {
        mediaItemId: mediaItem.id,
        versionNumber: 1,
        bunnyVideoId: nasSession.videoId,
        bunnyLibraryId: "nas",
        storageProvider: "NAS",
        nasPath: nasSession.path,
        uploadSignature: nasSession.signature,
        status: "UPLOADING",
        createdById: input.userId
      }
    });
    await tx.mediaItem.update({
      where: { id: mediaItem.id },
      data: { currentVersionId: version.id }
    });
    return { mediaItem, version };
  });

  return {
    mediaId: created.mediaItem.id,
    versionId: created.version.id,
    nextVersion: 1,
    upload: nasSession
  };
}

export async function completeCycleStageUpload(input: {
  userId: string;
  role: PlatformRole | null;
  rowId: string;
  slug: CycleStageSlug;
  mediaId: string;
  versionId: string;
}) {
  const version = await prisma.mediaVersion.findFirst({
    where: { id: input.versionId, mediaItemId: input.mediaId }
  });
  if (!version) {
    throw new Error("NOT_FOUND");
  }

  await prisma.mediaVersion.update({
    where: { id: version.id },
    data: { status: MediaStatus.READY, storageSyncedAt: new Date() }
  });
  await prisma.mediaItem.update({
    where: { id: input.mediaId },
    data: {
      currentVersionId: version.id,
      ...(input.slug === "initial-cut" ? { title: initialCutVersionTitle(version.versionNumber) } : {})
    }
  });

  const row = await prisma.packageProgressRow.findUniqueOrThrow({
    where: { id: input.rowId },
    include: { approval: true }
  });

  if (input.slug === "a-roll") {
    await prisma.packageStageMedia.upsert({
      where: { rowId_mediaItemId: { rowId: row.id, mediaItemId: input.mediaId } },
      create: { rowId: row.id, stage: "a-roll", mediaItemId: input.mediaId },
      update: {}
    });
    await recordAssociateReviewHistory({ rowId: row.id, stage: "a-roll", kind: "ready", actorId: input.userId, mediaVersionId: version.id });
    try {
      await notifyARollUploaded(row.id);
    } catch (error) {
      console.error("notifyARollUploaded failed", error);
    }
    return;
  }

  if (input.slug === "final-cut") {
    const replacing = Boolean(row.finalCutMediaItemId);
    await prisma.packageProgressRow.update({
      where: { id: row.id },
      data: { finalCutMediaItemId: input.mediaId, finalCut: true }
    });
    if (replacing) {
      await prisma.packageFinalCutScore.deleteMany({ where: { rowId: row.id } });
    }
    try {
      await notifyFinalCutUploaded(row.id);
    } catch (error) {
      console.error("notifyFinalCutUploaded failed", error);
    }
    return;
  }

  const approval = await getOrCreateApproval(row.id);
  const transition = applyInitialCutUpload({
    currentStage: approval.stage,
    awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
    nextVersionNumber: version.versionNumber
  });
  if (!transition.ok) {
    throw new Error("CONFLICT");
  }
  if (version.versionNumber === 1) {
    await recordAssociateReviewHistory({ rowId: row.id, stage: "initial-cut", kind: "ready", actorId: input.userId, mediaVersionId: version.id });
  }

  await prisma.packageProgressRow.update({
    where: { id: row.id },
    data: {
      initialCutMediaItemId: input.mediaId,
      awaitingRevisedInitialCut: transition.clearAwaiting ? false : row.awaitingRevisedInitialCut,
      revisedInitialCut: version.versionNumber >= 2 ? true : row.revisedInitialCut
    }
  });

  if (approval.stage === "DRAFT" || approval.stage !== transition.nextStage) {
    if (approval.stage === "DRAFT") {
      await prisma.packageApprovalSignoff.deleteMany({ where: { approvalId: approval.id } });
    }
    await prisma.packageApproval.update({
      where: { id: approval.id },
      data: { stage: transition.nextStage }
    });
  }

  if (transition.email) {
    try {
      await notifyPackageReview({
        progressRowId: row.id,
        kind: transition.email,
        mediaVersionId: version.id
      });
    } catch (error) {
      console.error("notifyPackageReview failed", error);
    }
  }
}

export async function saveFinalCutGrade(input: {
  rowId: string;
  graderUserId: string;
  role: PlatformRole | null;
  awardedPoints: number;
  turnedInDate?: Date | null;
}) {
  if (!isExecutiveProducer(input.role)) {
    throw new Error("FORBIDDEN");
  }

  const points = clampFinalCutScore(input.awardedPoints);
  const row = await prisma.packageProgressRow.findUniqueOrThrow({
    where: { id: input.rowId },
    include: {
      members: { select: { userId: true } },
      finalCutMediaItem: { select: { createdAt: true } },
      extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } }
    }
  });

  const [requiredGraders, existingScores, cycle, existingGrade] = await Promise.all([
    loadRequiredFinalCutGraders(),
    prisma.packageFinalCutScore.findMany({
      where: { rowId: row.id },
      select: { graderUserId: true, points: true }
    }),
    prisma.packageCycle.findUnique({
      where: { cycleNumber: row.cycleNumber },
      select: { finalCutDate: true }
    }),
    prisma.packageGrade.findFirst({
      where: {
        cycleNumber: row.cycleNumber,
        userId: { in: row.members.map((member) => member.userId) }
      },
      select: { awardedFinalCutPoints: true, revisionCount: true }
    })
  ]);

  const requiredIds = requiredGraders.map((grader) => grader.userId);
  const before = executiveGradeStatus({
    requiredGraderIds: requiredIds,
    scores: existingScores
  });

  await prisma.packageFinalCutScore.upsert({
    where: { rowId_graderUserId: { rowId: row.id, graderUserId: input.graderUserId } },
    create: { rowId: row.id, graderUserId: input.graderUserId, points },
    update: { points }
  });

  const nextScores = [
    ...existingScores.filter((score) => score.graderUserId !== input.graderUserId),
    { graderUserId: input.graderUserId, points }
  ];
  const after = executiveGradeStatus({
    requiredGraderIds: requiredIds,
    scores: nextScores
  });

  if (!after.complete || after.average === null) {
    const panel = await loadFinalCutGradePanel({
      rowId: row.id,
      role: input.role,
      userId: input.graderUserId
    });
    return {
      ...panel,
      awardedPoints: null,
      officialPoints: null,
      revisionCount: existingGrade?.revisionCount ?? 0,
      secondRevisionCapped: false,
      penaltyMultiplier: 0,
      daysLate: 0,
      blocksSecondRevision: false,
      deadline: null,
      turnedInDate: null
    };
  }

  const alreadyGraded =
    existingGrade?.awardedFinalCutPoints !== null && existingGrade?.awardedFinalCutPoints !== undefined;
  const nextRevisionCount =
    alreadyGraded && existingGrade
      ? before.complete
        ? existingGrade.revisionCount
        : Math.max(existingGrade.revisionCount, 1) + 1
      : 1;
  const cappedAwarded = capAwardedForRevision(after.average, nextRevisionCount);

  const turnedIn = input.turnedInDate ?? row.finalCutMediaItem?.createdAt ?? new Date();
  // Extensions can cover only some members, so the late penalty is per member.
  const officialForMember = (userId?: string) => {
    const memberDeadline = effectiveDeadline(
      cycle?.finalCutDate ?? null,
      approvedExtensionDaysFor(row, userId)
    );
    const memberPenalty = calculateLatePenalty(memberDeadline, turnedIn);
    return {
      deadline: memberDeadline,
      penalty: memberPenalty,
      official: officialFinalCutPoints(cappedAwarded, memberPenalty.penaltyMultiplier)
    };
  };
  const { deadline, penalty, official } = officialForMember();

  await prisma.$transaction(
    row.members.map((member) => {
      const memberOfficial = officialForMember(member.userId).official;
      return prisma.packageGrade.upsert({
        where: { cycleNumber_userId: { cycleNumber: row.cycleNumber, userId: member.userId } },
        create: {
          cycleNumber: row.cycleNumber,
          userId: member.userId,
          awardedFinalCutPoints: cappedAwarded,
          finalCutPoints: memberOfficial,
          revisionCount: nextRevisionCount,
          turnedInDate: turnedIn
        },
        update: {
          awardedFinalCutPoints: cappedAwarded,
          finalCutPoints: memberOfficial,
          revisionCount: nextRevisionCount,
          turnedInDate: turnedIn
        }
      });
    })
  );

  const panel = await loadFinalCutGradePanel({
    rowId: row.id,
    role: input.role,
    userId: input.graderUserId,
    officialPoints: official
  });

  return {
    ...panel,
    awardedPoints: cappedAwarded,
    officialPoints: official,
    revisionCount: nextRevisionCount,
    secondRevisionCapped: nextRevisionCount >= 2 && after.average > cappedAwarded,
    penaltyMultiplier: penalty.penaltyMultiplier,
    daysLate: penalty.daysLate,
    blocksSecondRevision: penalty.blocksSecondRevision,
    deadline: deadline?.toISOString() ?? null,
    turnedInDate: turnedIn.toISOString()
  };
}

function requireProducer(role: PlatformRole | null) {
  if (!hasPlatformRole(role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
}

async function loadProgressMembers(rowId: string) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      cycleNumber: true,
      members: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              notificationPreference: {
                select: {
                  emailEnabled: true,
                  notificationEmail: true,
                  emailGradesEnabled: true
                }
              }
            }
          }
        }
      }
    }
  });
  if (!row) throw new Error("NOT_FOUND");
  if (row.members.length === 0) {
    throw new Error("This package has no members to grade.");
  }
  return row;
}

function notifyMembersGradesPublished(input: {
  members: Array<{
    email: string | null;
    notificationPreference: {
      emailEnabled: boolean;
      notificationEmail: string | null;
      emailGradesEnabled: boolean;
    } | null;
  }>;
  cycleNumber: number;
  totalPoints: number;
  percentage: number;
}) {
  const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const gradeUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/grades` : "/grades";
  const recipients = input.members.flatMap((member) => {
    const preference = member.notificationPreference;
    if (!preference?.emailEnabled || !preference.emailGradesEnabled) return [];
    const email = preference.notificationEmail ?? member.email;
    return email ? [email] : [];
  });
  if (recipients.length === 0) return;
  void sendGradeEmails({
    recipients,
    cycleNumber: input.cycleNumber,
    totalPoints: input.totalPoints,
    percentage: input.percentage,
    gradeUrl,
    mode: "published"
  });
}

export async function savePackageCycleGradeFeedback(input: {
  rowId: string;
  role: PlatformRole | null;
  feedback: string;
}) {
  requireProducer(input.role);
  const feedback = normalizeCycleGradeFeedback(input.feedback);
  const row = await loadProgressMembers(input.rowId);

  await prisma.$transaction(
    row.members.map((member) =>
      prisma.packageGrade.upsert({
        where: { cycleNumber_userId: { cycleNumber: row.cycleNumber, userId: member.userId } },
        create: { cycleNumber: row.cycleNumber, userId: member.userId, feedback },
        update: { feedback }
      })
    )
  );

  const grades = await prisma.packageGrade.findMany({
    where: { cycleNumber: row.cycleNumber, userId: { in: row.members.map((member) => member.userId) } },
    select: { userId: true, feedback: true, publishedAt: true }
  });

  return {
    feedback,
    published: cycleGradesArePublished(grades, row.members.map((member) => member.userId)),
    publishedAt: grades.find((grade) => grade.publishedAt)?.publishedAt?.toISOString() ?? null
  };
}

export async function publishPackageCycleGrades(input: {
  rowId: string;
  role: PlatformRole | null;
  feedback?: string;
}) {
  requireProducer(input.role);
  const row = await loadProgressMembers(input.rowId);
  const memberIds = row.members.map((member) => member.userId);
  const existing = await prisma.packageGrade.findMany({
    where: { cycleNumber: row.cycleNumber, userId: { in: memberIds } }
  });
  const existingByUser = new Map(existing.map((grade) => [grade.userId, grade]));
  const nextFeedback =
    input.feedback !== undefined ? normalizeCycleGradeFeedback(input.feedback) : sharedGradeFeedback(existing);
  const publishedAt = new Date();
  const newlyPublishedUserIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const member of row.members) {
      const prev = existingByUser.get(member.userId);
      const alreadyPublished = Boolean(prev?.publishedAt);
      const saved = await tx.packageGrade.upsert({
        where: { cycleNumber_userId: { cycleNumber: row.cycleNumber, userId: member.userId } },
        create: {
          cycleNumber: row.cycleNumber,
          userId: member.userId,
          feedback: nextFeedback,
          publishedAt
        },
        update: {
          ...(input.feedback !== undefined ? { feedback: nextFeedback } : {}),
          ...(alreadyPublished ? {} : { publishedAt })
        },
        select: { id: true }
      });
      if (!alreadyPublished) {
        await tx.packageGradeHistoryEvent.create({
          data: { packageGradeId: saved.id, eventType: "PUBLISHED" }
        });
        if (!prev?.finalCutState) newlyPublishedUserIds.push(member.userId);
      }
    }
  });

  if (newlyPublishedUserIds.length > 0) {
    const sample = existing.find((grade) => newlyPublishedUserIds.includes(grade.userId));
    const official = sample?.finalCutPoints ?? sample?.awardedFinalCutPoints ?? sample?.effortPoints ?? 0;
    notifyMembersGradesPublished({
      members: row.members
        .filter((member) => newlyPublishedUserIds.includes(member.userId))
        .map((member) => member.user),
      cycleNumber: row.cycleNumber,
      totalPoints: gradeTotal(official),
      percentage: gradePercentage(gradeTotal(official))
    });
  }

  return {
    feedback: nextFeedback,
    published: true,
    publishedAt: publishedAt.toISOString()
  };
}

export { applyLatePenalty };
