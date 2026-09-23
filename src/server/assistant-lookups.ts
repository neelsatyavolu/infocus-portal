import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import { filterGroupsForViewer, isGroupAssignedToViewer } from "@/src/lib/groups-visibility";
import { groupTileStatus } from "@/src/lib/group-tile-status";
import { aRollFeedbackNeedsChanges } from "@/src/lib/package-stage-status";
import { remainingFromApproval } from "@/src/lib/package-approval";
import { parseClipComment } from "@/src/lib/package-clip-comments";
import { APPROVAL_COMMENT_PREFIX, parseApprovalComment } from "@/src/lib/package-stage-comments";
import {
  GROUP_NAV_TAB_LABELS,
  GROUP_STAGE_TAB_LABELS,
  pendingGroupNavSlug
} from "@/src/lib/package-stages";
import { formatTimecode } from "@/src/lib/timecode";
import type { PackageCategory, PlatformRole } from "@prisma/client";
import { getPlatformRoleForEmail, hasPlatformRole } from "@/src/lib/platform-admin";
import { userDisplayName } from "@/src/lib/user-display";
import { prisma } from "@/src/lib/prisma";
import { assertValidCycleNumber } from "@/src/server/program-settings";
import { buildGradeSummary } from "@/src/server/student-grade-summary";

const groupSelect = {
  id: true,
  cycleNumber: true,
  groupTopic: true,
  category: true,
  pitching: true,
  proofOfContact: true,
  aRollBRoll: true,
  initialCut: true,
  finalCut: true,
  awaitingRevisedInitialCut: true,
  queuedForAirAt: true,
  queuedForShowDate: true,
  brainstormDocUrl: true,
  assignedProducerUserId: true,
  assignedExecutiveProducerUserId: true,
  assignedProducer: { select: { name: true, nickname: true, email: true } },
  assignedExecutiveProducer: { select: { name: true, nickname: true, email: true } },
  members: { select: { userId: true, user: { select: { name: true, nickname: true, email: true } } } },
  approval: {
    select: {
      stage: true,
      controversial: true,
      signoffs: { select: { userId: true, stage: true, approved: true } }
    }
  },
  _count: { select: { proofOfContacts: true, stageComments: true } },
  initialCutMediaItem: {
    select: { currentVersion: { select: { versionNumber: true, approvalStatus: true } } }
  },
  finalCutMediaItemId: true,
  stageMedia: {
    where: { stage: "a-roll" },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { createdAt: true }
  },
  stageComments: {
    where: { stage: "a-roll", NOT: { body: { startsWith: APPROVAL_COMMENT_PREFIX } } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { createdAt: true }
  }
} as const;

async function loadGroupRows(cycleNumber?: number) {
  if (cycleNumber != null) {
    await assertValidCycleNumber(cycleNumber);
  }
  return prisma.packageProgressRow.findMany({
    where: cycleNumber != null ? { cycleNumber } : undefined,
    orderBy: [{ cycleNumber: "asc" }, { rowOrder: "asc" }],
    select: groupSelect
  });
}

type GroupLookupRow = Awaited<ReturnType<typeof loadGroupRows>>[number];

export function summarizeAssistantGroup(row: GroupLookupRow, detail = false, actorUserId?: string) {
  const remaining = remainingFromApproval(row.approval);
  const approvalStage = row.approval?.stage ?? "DRAFT";
  const aRollHasMedia = row.stageMedia.length > 0;
  const status = groupTileStatus({
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    proofCount: row._count.proofOfContacts,
    brainstormDocUrl: row.brainstormDocUrl,
    aRollBRoll: row.aRollBRoll,
    aRollHasMedia,
    aRollNeedsChanges: aRollFeedbackNeedsChanges(
      row.aRollBRoll,
      row.stageComments.length > 0,
      row.stageComments[0]?.createdAt,
      row.stageMedia[0]?.createdAt
    ),
    initialCutHasMedia: Boolean(row.initialCutMediaItem),
    initialCutVersionNumber: row.initialCutMediaItem?.currentVersion?.versionNumber ?? null,
    initialCutNeedsRevisions: row.initialCutMediaItem?.currentVersion?.approvalStatus === "NEEDS_CHANGES",
    awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
    approvalStage,
    remainingExecutiveSignoffs: remaining,
    finalCutHasMedia: Boolean(row.finalCutMediaItemId),
    queuedForAir: Boolean(row.queuedForAirAt)
  });
  const currentStage = GROUP_NAV_TAB_LABELS[
    pendingGroupNavSlug({
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      finalCut: row.finalCut,
      approvalStage
    })
  ];
  const summary = {
    cycle: row.cycleNumber,
    topic: row.groupTopic.trim() || "(untitled)",
    members: row.members.map((member) => userDisplayName(member.user) || member.user.email || "Unknown"),
    producer: userDisplayName(row.assignedProducer ?? row.assignedExecutiveProducer ?? {}) || "Unassigned",
    currentStage,
    status: status.label,
    noteCount: row._count.stageComments ?? 0,
    ...(actorUserId
      ? {
          youProduce: isGroupAssignedToViewer(row, actorUserId),
          youOnIt: row.members.some((member) => member.userId === actorUserId)
        }
      : {})
  };
  if (!detail) {
    return summary;
  }
  return {
    ...summary,
    stages: {
      pitching: row.pitching ? "approved" : "not yet",
      contact: row.proofOfContact ? "approved" : "not yet",
      aRoll: row.aRollBRoll ? "approved" : aRollHasMedia ? "submitted" : "not yet",
      initial: row.approval?.stage === "APPROVED" ? "approved" : row.initialCutMediaItem ? status.label : "not yet",
      final:
        row.queuedForAirAt
          ? `queued${row.queuedForShowDate ? ` ${row.queuedForShowDate}` : ""}`
          : row.finalCut || row.finalCutMediaItemId
            ? "submitted"
            : "not yet"
    }
  };
}

function filledGroups(rows: GroupLookupRow[]) {
  return rows.filter((row) => row.groupTopic.trim() || row.members.length > 0);
}

export function filterAssistantLookupGroups<
  T extends {
    assignedProducerUserId?: string | null;
    assignedExecutiveProducerUserId?: string | null;
    category?: PackageCategory | null;
    members?: Array<{ userId?: string }>;
  }
>(
  rows: T[],
  viewer: {
    platformRole: PlatformRole | null;
    currentUserId: string;
    producerCategory: PackageCategory | null;
  }
) {
  if (!viewer.platformRole) {
    return rows.filter((row) => row.members?.some((member) => member.userId === viewer.currentUserId));
  }
  return filterGroupsForViewer(rows, viewer);
}

async function viewerFor(actorUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { email: true }
  });
  const platformRole = await getPlatformRoleForEmail(user?.email);
  return { platformRole, currentUserId: actorUserId, producerCategory: null as null };
}

export async function listAssistantGroups(params: { cycleNumber?: number; actorUserId: string }) {
  const [rows, viewer] = await Promise.all([loadGroupRows(params.cycleNumber), viewerFor(params.actorUserId)]);
  const visible = filterAssistantLookupGroups(filledGroups(rows), viewer);
  return visible.map((row) => summarizeAssistantGroup(row, false, viewer.currentUserId));
}

export async function listAssistantProducedGroups(params: { cycleNumber?: number; actorUserId: string }) {
  const [rows, viewer] = await Promise.all([loadGroupRows(params.cycleNumber), viewerFor(params.actorUserId)]);
  const visible = filterAssistantLookupGroups(filledGroups(rows), viewer).filter((row) =>
    isGroupAssignedToViewer(row, viewer.currentUserId)
  );
  return visible.map((row) => summarizeAssistantGroup(row, false, viewer.currentUserId));
}

export async function findAssistantGroupRow(params: {
  topic: string;
  cycleNumber?: number;
  actorUserId: string;
}) {
  const topic = params.topic.trim();
  if (!topic) {
    throw new Error("Name the package topic.");
  }
  const [rows, viewer] = await Promise.all([loadGroupRows(params.cycleNumber), viewerFor(params.actorUserId)]);
  const visible = filterAssistantLookupGroups(filledGroups(rows), viewer);
  const needle = topic.toLowerCase();
  const exact = visible.filter((row) => row.groupTopic.trim().toLowerCase() === needle);
  const pool =
    exact.length > 0 ? exact : visible.filter((row) => row.groupTopic.toLowerCase().includes(needle));
  if (pool.length === 0) {
    throw new Error(`No package matched “${topic}”.`);
  }
  if (pool.length > 1) {
    throw new Error(`Several packages match “${topic}”. Say which cycle.`);
  }
  return pool[0];
}

const STAGE_COMMENT_LIMIT = 24;
const REVIEW_COMMENT_LIMIT = 16;
const NOTE_CHARS = 800;

const SIGNOFF_STAGE_LABEL: Record<string, string> = {
  ASSOCIATE_REVIEW: "stage 1 (assigned producer)",
  ADVISER_REVIEW: "stage 2 (adviser)",
  EXECUTIVE_REVIEW: "stage 3 (executive producers)"
};

export function formatAssistantStageComment(input: {
  stage: string;
  body: string;
  createdAt: Date;
  author: { name?: string | null; nickname?: string | null; email?: string | null };
}) {
  const approval = parseApprovalComment(input.body);
  const clip = parseClipComment(approval.text);
  const stage = (GROUP_STAGE_TAB_LABELS as Record<string, string>)[input.stage] ?? input.stage;
  return {
    stage,
    from: userDisplayName(input.author) || "Unknown",
    kind: approval.fromApproval ? "approval note" : clip.mediaItemId ? "clip note" : "note",
    text: clip.text.trim().slice(0, NOTE_CHARS),
    when: input.createdAt.toISOString().slice(0, 10)
  };
}

export function formatAssistantReviewComment(input: {
  body: string;
  timeSeconds: number;
  resolvedAt: Date | null;
  createdAt: Date;
  author: { name?: string | null; nickname?: string | null; email?: string | null } | null;
  cut: "Initial Cut" | "Final Cut";
}) {
  return {
    cut: input.cut,
    from: userDisplayName(input.author ?? {}) || "Unknown",
    text: input.body.trim().slice(0, NOTE_CHARS),
    at: formatTimecode(input.timeSeconds),
    resolved: Boolean(input.resolvedAt),
    when: input.createdAt.toISOString().slice(0, 10)
  };
}

function mediaStatusLabel(status: string) {
  if (status === "NEEDS_CHANGES") {
    return "needs changes";
  }
  if (status === "APPROVED") {
    return "approved";
  }
  if (status === "IN_REVIEW") {
    return "pending review";
  }
  return "pending";
}

function stageLabel(slug: string) {
  return (GROUP_STAGE_TAB_LABELS as Record<string, string>)[slug] ?? slug;
}

async function loadAssistantGroupDetail(rowId: string, includeRosterNotes: boolean) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      extension: true,
      possibleInterviews: true,
      possibleIdeas: true,
      notes: true,
      stageNotes: true,
      brainstormDocUrl: true,
      proofOfContacts: {
        select: { slot: true, fileName: true, uploadedBy: { select: { name: true, nickname: true, email: true } } },
        orderBy: { slot: "asc" }
      },
      stageComments: {
        orderBy: { createdAt: "desc" },
        take: STAGE_COMMENT_LIMIT,
        select: {
          stage: true,
          body: true,
          createdAt: true,
          author: { select: { name: true, nickname: true, email: true } }
        }
      },
      stageMedia: {
        where: { stage: "a-roll" },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          mediaItem: {
            select: {
              title: true,
              currentVersion: { select: { versionNumber: true, approvalStatus: true, createdAt: true } }
            }
          }
        }
      },
      initialCutMediaItem: {
        select: {
          title: true,
          versions: {
            orderBy: { versionNumber: "asc" },
            select: {
              versionNumber: true,
              approvalStatus: true,
              createdAt: true,
              comments: {
                where: { parentCommentId: null },
                orderBy: { createdAt: "desc" },
                take: REVIEW_COMMENT_LIMIT,
                select: {
                  body: true,
                  timeSeconds: true,
                  resolvedAt: true,
                  createdAt: true,
                  author: { select: { name: true, nickname: true, email: true } }
                }
              }
            }
          }
        }
      },
      finalCutMediaItem: {
        select: {
          title: true,
          currentVersion: {
            select: {
              versionNumber: true,
              approvalStatus: true,
              createdAt: true,
              comments: {
                where: { parentCommentId: null },
                orderBy: { createdAt: "desc" },
                take: REVIEW_COMMENT_LIMIT,
                select: {
                  body: true,
                  timeSeconds: true,
                  resolvedAt: true,
                  createdAt: true,
                  author: { select: { name: true, nickname: true, email: true } }
                }
              }
            }
          }
        }
      },
      approval: {
        select: {
          controversial: true,
          signoffs: {
            orderBy: { createdAt: "asc" },
            select: {
              stage: true,
              approved: true,
              note: true,
              user: { select: { name: true, nickname: true, email: true } }
            }
          }
        }
      }
    }
  });

  if (!row) {
    return {};
  }

  const comments = row.stageComments
    .map((comment) => formatAssistantStageComment(comment))
    .filter((comment) => comment.text);
  const uploads = [
    ...row.stageMedia.map((link) => ({
      stage: stageLabel("a-roll"),
      title: link.mediaItem.title,
      version: link.mediaItem.currentVersion?.versionNumber ?? null,
      status: mediaStatusLabel(link.mediaItem.currentVersion?.approvalStatus ?? "IN_REVIEW"),
      when: (link.mediaItem.currentVersion?.createdAt ?? link.createdAt).toISOString().slice(0, 10)
    })),
    ...(row.initialCutMediaItem?.versions.map((version) => ({
      stage: stageLabel("initial-cut"),
      title: row.initialCutMediaItem?.title ?? "Initial Cut",
      version: version.versionNumber,
      status: mediaStatusLabel(version.approvalStatus),
      when: version.createdAt.toISOString().slice(0, 10)
    })) ?? []),
    ...(row.finalCutMediaItem?.currentVersion
      ? [
          {
            stage: stageLabel("final-cut"),
            title: row.finalCutMediaItem.title,
            version: row.finalCutMediaItem.currentVersion.versionNumber,
            status: mediaStatusLabel(row.finalCutMediaItem.currentVersion.approvalStatus),
            when: row.finalCutMediaItem.currentVersion.createdAt.toISOString().slice(0, 10)
          }
        ]
      : [])
  ];
  const playerComments = [
    ...(row.initialCutMediaItem?.versions.flatMap((version) =>
      version.comments.map((comment) =>
        formatAssistantReviewComment({ ...comment, cut: "Initial Cut" as const })
      )
    ) ?? []),
    ...(row.finalCutMediaItem?.currentVersion?.comments.map((comment) =>
      formatAssistantReviewComment({ ...comment, cut: "Final Cut" as const })
    ) ?? [])
  ]
    .filter((comment) => comment.text)
    .slice(0, REVIEW_COMMENT_LIMIT);

  const rosterNotes: Record<string, string> = {};
  if (includeRosterNotes) {
    if (row.possibleInterviews.trim()) {
      rosterNotes.possibleInterviews = row.possibleInterviews.trim().slice(0, NOTE_CHARS);
    }
    if (row.possibleIdeas.trim()) {
      rosterNotes.possibleIdeas = row.possibleIdeas.trim().slice(0, NOTE_CHARS);
    }
    if (row.notes.trim()) {
      rosterNotes.notes = row.notes.trim().slice(0, NOTE_CHARS);
    }
    const stageNotes =
      row.stageNotes && typeof row.stageNotes === "object" && !Array.isArray(row.stageNotes)
        ? (row.stageNotes as Record<string, unknown>)
        : {};
    for (const [slug, value] of Object.entries(stageNotes)) {
      if (typeof value === "string" && value.trim()) {
        rosterNotes[stageLabel(slug)] = value.trim().slice(0, NOTE_CHARS);
      }
    }
  }

  return {
    comments,
    uploads,
    playerComments,
    proofs: {
      count: row.proofOfContacts.length,
      files: row.proofOfContacts.map((proof) => proof.fileName)
    },
    hasBrainstormDoc: Boolean(row.brainstormDocUrl.trim()),
    extension: row.extension,
    controversial: Boolean(row.approval?.controversial),
    signoffs: (row.approval?.signoffs ?? []).map((entry) => ({
      from: userDisplayName(entry.user) || "Unknown",
      stage: SIGNOFF_STAGE_LABEL[entry.stage] ?? entry.stage,
      approved: entry.approved,
      note: entry.note.trim().slice(0, NOTE_CHARS) || null
    })),
    ...(Object.keys(rosterNotes).length > 0 ? { rosterNotes } : {})
  };
}

export async function getAssistantGroup(params: {
  topic: string;
  cycleNumber?: number;
  actorUserId: string;
}) {
  const row = await findAssistantGroupRow(params);
  const viewer = await viewerFor(params.actorUserId);
  const detail = await loadAssistantGroupDetail(row.id, Boolean(viewer.platformRole));
  return {
    ...summarizeAssistantGroup(row, true, params.actorUserId),
    ...detail
  };
}

export async function getAssistantGrades(params: { person: { userId: string; name: string; email: string | null }; actorUserId: string }) {
  const actor = await viewerFor(params.actorUserId);
  if (!hasPlatformRole(actor.platformRole, "EXECUTIVE_PRODUCER")) {
    throw new Error("Only executives, the adviser, and super admin can look up grades.");
  }
  const nonGradableEmails = await loadNonGradableEmails();
  if (isExcludedFromGrading({ name: params.person.name, email: params.person.email }, nonGradableEmails)) {
    throw new Error("That person is not on the gradebook.");
  }
  const summary = await buildGradeSummary(params.person.userId);
  return {
    name: params.person.name,
    letter: summary.letter,
    percentage: summary.percentage,
    packages: {
      finalCut: summary.cycleNumbers.map((cycleNumber, index) => ({
        cycle: cycleNumber,
        points: summary.finalCutPoints[index],
        display: summary.finalCutPoints[index] == null ? "ungraded" : summary.finalCutPoints[index]
      })),
      checkIns: summary.cycleNumbers.map((cycleNumber, index) => ({
        cycle: cycleNumber,
        earned: summary.checkInPoints[index],
        possible: summary.checkInPossible[index]
      })),
      livestream: summary.livestreamPoints
    },
    participation: {
      earned: summary.participationEarned,
      possible: summary.participationPossible
    },
    portfolio: summary.portfolioPoints
  };
}
