import { combineAssociateScore, groupProgress, groupFeedbackScore } from "@/src/lib/associate-score-components";
import { approvedExtensionDaysFor, effectiveDeadline } from "@/src/lib/package-extensions";
import { getAssociateFeedbackQuality } from "@/src/server/associate-feedback-quality";
import { loadProducerFeedback } from "@/src/server/producer-feedback";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { scoreAssociate, type AssociatePerformance, type AssociateStageSample } from "@/src/lib/associate-performance";
import { parseApprovalComment } from "@/src/lib/package-stage-comments";
import { isReviewNoticeText, parseReviewNotice } from "@/src/lib/package-review-notice";
import { loadAssignableProducers } from "@/src/server/package-progress-data";
import { ASSOCIATE_REVIEW_AUDIT } from "@/src/server/associate-review-history";

export async function loadAssociatePerformance(cycleNumber: number, options: { evaluateUserId?: string; includeGroupFeedback?: boolean; refreshDay?: string } = {}) {
  const [producers, cycle, groupReviews] = await Promise.all([
    loadAssignableProducers(),
    prisma.packageCycle.findUnique({ where: { cycleNumber } }),
    options.includeGroupFeedback ? loadProducerFeedback(cycleNumber) : Promise.resolve([])
  ]);
  const ids = producers.map((p) => p.userId);
  const versionSelect = {
    id: true, createdAt: true, versionNumber: true,
    comments: { where: { authorId: { in: ids } }, select: { id: true, authorId: true, body: true, createdAt: true } },
    approvalEvents: { where: { changedById: { in: ids }, OR: [{ note: "Review submitted" }, { status: "APPROVED" }, { status: "NEEDS_CHANGES" }] }, select: { changedById: true, createdAt: true, note: true } }
  } satisfies Prisma.MediaVersionSelect;
  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber, assignedProducerUserId: { in: ids } },
    select: {
      id: true, groupTopic: true, assignedProducerUserId: true,
      members: { select: { userId: true, user: { select: { name: true, nickname: true } } } },
      brainstormDocUrl: true, pitching: true, proofOfContact: true, aRollBRoll: true, initialCut: true, finalCut: true, extension: true,
      extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } },
      proofOfContacts: { select: { id: true } },
      stageComments: { where: { authorId: { in: ids } }, select: { id: true, authorId: true, stage: true, body: true, createdAt: true } },
      stageMedia: { where: { stage: "a-roll" }, select: { mediaItem: { select: {
        versions: { where: { status: "READY" }, select: versionSelect }
      } } } },
      initialCutMediaItem: { select: { versions: { where: { status: "READY" }, select: versionSelect } } },
      finalCutMediaItem: { select: { versions: { where: { status: "READY" }, select: versionSelect } } },
      approval: { select: { stage: true, signoffs: { where: { stage: "ASSOCIATE_REVIEW" }, select: { id: true, userId: true, note: true, createdAt: true } } } }
    }
  });
  const history = rows.length ? await prisma.auditLog.findMany({
    where: { action: ASSOCIATE_REVIEW_AUDIT, targetType: "PackageProgressRow", targetId: { in: rows.map((r) => r.id) } },
    select: { id: true, targetId: true, actorId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  }) : [];
  const now = new Date();
  return {
    cycleNumber,
    associates: await Promise.all(producers.map(async (producer): Promise<AssociatePerformance> => {
      const assigned = rows.filter((r) => r.assignedProducerUserId === producer.userId && !r.members.some((m) => m.userId === producer.userId));
      const samples: AssociateStageSample[] = [];
      const feedback: AssociatePerformance["feedback"] = [];
      for (const row of assigned) {
        const topic = row.groupTopic.trim() || "Untitled group";
        const logs = history.filter((h) => h.targetId === row.id).flatMap((h) => {
          const meta = h.metadata;
          if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
          if (meta.assignedProducerUserId !== producer.userId) return [];
          return [{ ...h, stage: meta.stage, kind: meta.kind, mediaVersionId: meta.mediaVersionId, note: typeof meta.note === "string" ? meta.note : "" }];
        });
        const stages = ["brainstorming", "a-roll", "initial-cut"] as const;
        for (const stage of stages) {
          const versions = stage === "a-roll" ? row.stageMedia.flatMap((m) => m.mediaItem.versions)
            : stage === "initial-cut" ? row.initialCutMediaItem?.versions.filter((v) => v.versionNumber === 1) ?? [] : [];
          const readiness = logs.filter((h) => h.stage === stage && h.kind === "ready");
          const firstUpload = versions.map((v) => {
            const event = readiness.find((h) => h.mediaVersionId === v.id);
            return { date: event?.createdAt ?? v.createdAt, estimated: !event };
          }).sort((a, b) => a.date.getTime() - b.date.getTime())[0];
          const submitted = stage === "brainstorming" ? readiness[0]?.createdAt ?? null : firstUpload?.date ?? null;
          const stageComments = row.stageComments.filter((c) => c.stage === stage && c.authorId === producer.userId);
          const clipComments = versions.flatMap((v) => v.comments.filter((c) => c.authorId === producer.userId));
          const signoffs = stage === "initial-cut" ? row.approval?.signoffs.filter((s) => s.userId === producer.userId) ?? [] : [];
          const actions = logs.filter((h) => h.stage === stage && h.kind === "review" && h.actorId === producer.userId);
          const events = versions.flatMap((v) => v.approvalEvents.filter((e) => e.changedById === producer.userId));
          const responses = [...stageComments, ...clipComments, ...signoffs, ...actions, ...events]
            .filter((c) => (!submitted || c.createdAt >= submitted) && c.createdAt <= now)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          const respondedAt = responses[0]?.createdAt ?? null;
          const qualityClipComments = stage === "initial-cut"
            ? row.initialCutMediaItem?.versions.flatMap((v) => v.comments.filter((c) => c.authorId === producer.userId)) ?? [] : clipComments;
          const notes = [...stageComments, ...qualityClipComments].map((c) => ({ ...c, body: parseReviewNotice(parseApprovalComment(c.body).text).text }))
            .filter((c) => c.body.trim() && !isReviewNoticeText(c.body));
          for (const note of notes) {
            feedback.push({ id: note.id, rowId: row.id, topic, stage, body: note.body, createdAt: note.createdAt.toISOString() });
          }
          // Durable decision notes are kept even if mutable signoffs are later cleared.
          for (const action of actions.filter((a) => a.note.trim())) {
            if (!notes.some((n) => n.body.trim() === action.note.trim())) {
              feedback.push({ id: action.id, rowId: row.id, topic, stage, body: action.note, createdAt: action.createdAt.toISOString() });
            }
          }
          for (const signoff of signoffs.filter((s) => s.note.trim())) {
            if (!notes.some((n) => n.body.trim() === signoff.note.trim()) && !actions.some((a) => a.note.trim() === signoff.note.trim())) {
              feedback.push({ id: signoff.id, rowId: row.id, topic, stage, body: signoff.note, createdAt: signoff.createdAt.toISOString() });
            }
          }
          const approved = stage === "brainstorming" ? row.proofOfContact : stage === "a-roll" ? row.aRollBRoll
            : !!row.approval && ["ADVISER_REVIEW", "EXECUTIVE_REVIEW", "APPROVED"].includes(row.approval.stage);
          const hasMaterials = !!submitted || (stage === "brainstorming" && !!row.brainstormDocUrl.trim() && row.proofOfContacts.length >= 3);
          if (!hasMaterials && !approved && !respondedAt) continue;
          samples.push({
            rowId: row.id, topic, stage,
            submittedAt: submitted?.toISOString() ?? null, respondedAt: respondedAt?.toISOString() ?? null,
            hasFeedback: notes.some((n) => (!submitted || n.createdAt >= submitted) && n.createdAt <= now) || actions.some((a) => a.note.trim() && (!submitted || a.createdAt >= submitted) && a.createdAt <= now)
              || signoffs.some((s) => s.note.trim() && (!submitted || s.createdAt >= submitted) && s.createdAt <= now),
            historicalUnknown: !submitted || (approved && !respondedAt), estimated: firstUpload?.estimated ?? false
          });
        }
      }
      // Later cuts and pitching notes inform feedback quality, but never change first-review timing.
      for (const row of assigned) {
        const extras = [
          ...row.stageComments.filter((c) => c.authorId === producer.userId && (c.stage === "pitching" || c.stage === "final-cut")),
          ...(row.finalCutMediaItem?.versions.flatMap((v) => v.comments.filter((c) => c.authorId === producer.userId).map((c) => ({ ...c, stage: "final-cut" }))) ?? [])
        ];
        for (const note of extras) {
          const body = parseReviewNotice(parseApprovalComment(note.body).text).text.trim();
          if (body && !isReviewNoticeText(body)) feedback.push({ id: note.id, rowId: row.id, topic: row.groupTopic || "Untitled group", stage: note.stage, body, createdAt: note.createdAt.toISOString() });
        }
      }
      const metrics = scoreAssociate(samples, now);
      const progressGroups = assigned.map((row) => ({
        rowId: row.id, topic: row.groupTopic || "Untitled group",
        ...groupProgress([
          { label: "Pitching", dueAt: cycle?.pitchingDate?.toISOString() ?? null, complete: row.pitching },
          { label: "Brainstorming", dueAt: cycle?.proofOfContactDate?.toISOString() ?? null, complete: row.proofOfContact },
          { label: "A-roll / B-roll", dueAt: cycle?.aRollBRollDate?.toISOString() ?? null, complete: row.aRollBRoll },
          { label: "Initial cut", dueAt: cycle?.initialCutDate?.toISOString() ?? null, complete: row.initialCut },
          { label: "Final cut", dueAt: effectiveDeadline(cycle?.finalCutDate ?? null, approvedExtensionDaysFor(row))?.toISOString() ?? null, complete: row.finalCut }
        ], now)
      }));
      const progressScores = progressGroups.map((g) => g.score).filter((s): s is number => s !== null);
      const progress = { score: progressScores.length ? Math.round(progressScores.reduce((a, b) => a + b, 0) / progressScores.length) : null, groups: progressGroups };
      const reviews = groupReviews.filter((r) => r.producerId === producer.userId);
      const groupFeedback = { visible: !!options.includeGroupFeedback, score: groupFeedbackScore(reviews), reviews };
      const names = [producer.name ?? "", ...assigned.flatMap((r) => r.members.flatMap((m) => [m.user.name ?? "", m.user.nickname ?? ""]))]
        .flatMap((name) => [name, name.split(/\s+/)[0] ?? ""]);
      const quality = await getAssociateFeedbackQuality({ associateId: producer.userId, cycleNumber, notes: feedback, names, eligibleReviews: metrics.eligible }, options.evaluateUserId === producer.userId, options.evaluateUserId === producer.userId ? options.refreshDay : undefined);
      return {
        userId: producer.userId, name: producer.name || producer.email || "Associate",
        assignedGroups: assigned.length, samples,
        metrics: { ...metrics, ...combineAssociateScore({ quality: quality.score, progress: progress.score, groupFeedback: groupFeedback.score,
          responsiveness: metrics.responsiveness, reviewCoverage: metrics.reviewCoverage, feedbackCoverage: metrics.feedbackCoverage }) },
        quality, progress, groupFeedback,
        feedback: feedback.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
      };
    }))
  };
}
