import { brainstormMaterialsReady } from "@/src/lib/package-brainstorm";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { GROUP_STAGE_TAB_LABELS, PACKAGE_STAGE_LABELS, SLUG_TO_PACKAGE_STAGE } from "@/src/lib/package-stages";

export function brainstormBecameReady(
  before: { proofCount: number; docUrl: string },
  after: { proofCount: number; docUrl: string }
) {
  return (
    !brainstormMaterialsReady(before.proofCount, before.docUrl) &&
    brainstormMaterialsReady(after.proofCount, after.docUrl)
  );
}

export function studentStagePath(stage: GroupStageSlug) {
  switch (stage) {
    case "pitching":
      return "/dashboard";
    case "brainstorming":
      return "/brainstorming";
    case "a-roll":
      return "/a-roll";
    case "initial-cut":
      return "/initial-cut";
    case "final-cut":
      return "/final-cut";
  }
}

export function producerStagePath(rowId: string, stage: GroupStageSlug) {
  return `/groups/${rowId}/${stage}`;
}

export function stageEmailLabel(stage: GroupStageSlug) {
  return PACKAGE_STAGE_LABELS[SLUG_TO_PACKAGE_STAGE[stage]] ?? GROUP_STAGE_TAB_LABELS[stage];
}

export function untitledTopic(groupTopic: string) {
  return groupTopic.trim() || "Untitled package";
}

export function commentExcerpt(body: string, max = 180) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export type PackageMailContent = {
  subject: string;
  heading: string;
  paragraphs: string[];
  ctaLabel: string;
  pushTitle: string;
  pushBody: string;
};

function cycleTopic(cycleNumber: number, topic: string) {
  return `${untitledTopic(topic)} (Cycle ${cycleNumber})`;
}

export function brainstormReadyMail(input: { cycleNumber: number; topic: string; members: string }): PackageMailContent {
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber}: brainstorming ready — ${untitledTopic(input.topic)}`,
    heading: "Brainstorming is ready to review",
    paragraphs: [
      `${label} submitted all three proof-of-contact images and a brainstorm doc.`,
      input.members ? `Members: ${input.members}` : "Open Groups to review the materials."
    ],
    ctaLabel: "Open in Groups",
    pushTitle: "Brainstorming ready",
    pushBody: `${label} submitted proofs and a brainstorm doc.`
  };
}

export function reviewNeededMail(input: {
  cycleNumber: number;
  topic: string;
  members: string;
  stageLabel: string;
}): PackageMailContent {
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber} ${input.stageLabel}: ${untitledTopic(input.topic)}`,
    heading: `Ready for ${input.stageLabel}`,
    paragraphs: [`${label} is ready for ${input.stageLabel}.`, input.members ? `Members: ${input.members}` : "Open Groups to review."],
    ctaLabel: "Open in Groups",
    pushTitle: input.stageLabel,
    pushBody: `${label} is ready for ${input.stageLabel}.`
  };
}

export function finalCutUploadedMail(input: { cycleNumber: number; topic: string; members: string }): PackageMailContent {
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber}: Final Cut uploaded — ${untitledTopic(input.topic)}`,
    heading: "Final Cut uploaded",
    paragraphs: [`${label} uploaded a Final Cut.`, input.members ? `Members: ${input.members}` : "Open Groups to review."],
    ctaLabel: "Open in Groups",
    pushTitle: "Final Cut uploaded",
    pushBody: `${label} uploaded a Final Cut.`
  };
}

export function aRollUploadedMail(input: { cycleNumber: number; topic: string; members: string }): PackageMailContent {
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber}: A-roll/B-roll uploaded — ${untitledTopic(input.topic)}`,
    heading: "A-roll/B-roll uploaded",
    paragraphs: [
      `${label} uploaded A-roll/B-roll footage.`,
      input.members ? `Members: ${input.members}` : "Open Groups to review."
    ],
    ctaLabel: "Open in Groups",
    pushTitle: "A-roll/B-roll uploaded",
    pushBody: `${label} uploaded A-roll/B-roll footage.`
  };
}

/** Idempotency key for PackageReviewNotice: one A-roll producer email per group per Pacific day. */
export function aRollDailyNoticeVersionId(now = new Date()) {
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  return `a-roll:${dayKey}`;
}

export function aRollNeedsChangesMail(input: {
  cycleNumber: number;
  topic: string;
  authorName: string;
  excerpt: string;
}): PackageMailContent {
  const author = input.authorName.trim() || "A producer";
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber}: A-roll/B-roll needs changes — ${untitledTopic(input.topic)}`,
    heading: "A-roll/B-roll needs changes",
    paragraphs: [`${author} asked for changes on ${label}.`, input.excerpt].filter(Boolean),
    ctaLabel: "Open A-roll/B-roll",
    pushTitle: "A-roll/B-roll needs changes",
    pushBody: `${author}: ${input.excerpt}`
  };
}

export function revisionMail(input: { cycleNumber: number; topic: string; reviewerName: string }): PackageMailContent {
  const reviewer = input.reviewerName.trim() || "A producer";
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber}: review comments on ${untitledTopic(input.topic)}`,
    heading: "New review on your Initial Cut",
    paragraphs: [
      `${reviewer} submitted a review of ${label}.`,
      "Open the Initial Cut to see comments and upload a revision."
    ],
    ctaLabel: "Open Initial Cut",
    pushTitle: "Initial Cut review",
    pushBody: `${reviewer} submitted a review of ${label}.`
  };
}

export function commentMail(input: {
  cycleNumber: number;
  topic: string;
  stage: GroupStageSlug;
  authorName: string;
  excerpt: string;
}): PackageMailContent {
  const author = input.authorName.trim() || "A producer";
  const stageLabel = stageEmailLabel(input.stage);
  const label = cycleTopic(input.cycleNumber, input.topic);
  return {
    subject: `Cycle ${input.cycleNumber}: comment on ${untitledTopic(input.topic)} (${stageLabel})`,
    heading: `New comment on ${stageLabel}`,
    paragraphs: [`${author} left a comment on ${label}.`, input.excerpt],
    ctaLabel: "Open comments",
    pushTitle: `${stageLabel} comment`,
    pushBody: `${author}: ${input.excerpt}`
  };
}

export function checkInApprovedMail(input: {
  cycleNumber: number;
  topic: string;
  stage: GroupStageSlug;
  reviewerName: string;
  excerpt?: string;
}): PackageMailContent {
  const reviewer = input.reviewerName.trim() || "A producer";
  const stageLabel = stageEmailLabel(input.stage);
  const label = cycleTopic(input.cycleNumber, input.topic);
  const excerpt = input.excerpt?.trim();
  return {
    subject: `Cycle ${input.cycleNumber}: ${stageLabel} approved`,
    heading: `${stageLabel} approved`,
    paragraphs: [`${reviewer} approved ${stageLabel} for ${label}.`, excerpt].filter((paragraph): paragraph is string =>
      Boolean(paragraph)
    ),
    ctaLabel: "Open InFocus Portal",
    pushTitle: `${stageLabel} approved`,
    pushBody: excerpt ? `${reviewer}: ${excerpt}` : `${reviewer} approved ${stageLabel} for ${label}.`
  };
}

export function approvalDecisionMail(input: {
  cycleNumber: number;
  topic: string;
  kind: "stage-1" | "stage-2" | "approved" | "sent-back";
  reviewerName: string;
  excerpt?: string;
}): PackageMailContent {
  const reviewer = input.reviewerName.trim() || "A producer";
  const label = cycleTopic(input.cycleNumber, input.topic);
  const topic = untitledTopic(input.topic);
  const excerpt = input.excerpt?.trim();

  if (input.kind === "sent-back") {
    return {
      subject: `Cycle ${input.cycleNumber}: ${topic} sent back for revisions`,
      heading: "Package sent back",
      paragraphs: [
        `${reviewer} sent ${label} back for revisions.`,
        excerpt,
        "Upload a new Initial Cut version. It goes back to the same stage for review."
      ].filter((paragraph): paragraph is string => Boolean(paragraph)),
      ctaLabel: "Open Initial Cut",
      pushTitle: "Package sent back",
      pushBody: excerpt ? `${reviewer}: ${excerpt}` : `${reviewer} sent ${label} back for revisions.`
    };
  }

  if (input.kind === "stage-1") {
    return {
      subject: `Cycle ${input.cycleNumber}: Stage 1 approved — ${topic}`,
      heading: "Stage 1 approved",
      paragraphs: [
        `${reviewer} approved Stage 1 for ${label}. It is now with the adviser (Stage 2).`,
        excerpt
      ].filter((paragraph): paragraph is string => Boolean(paragraph)),
      ctaLabel: "Open Initial Cut",
      pushTitle: "Stage 1 approved",
      pushBody: excerpt ? `${reviewer}: ${excerpt}` : `${label} is with the adviser (Stage 2).`
    };
  }

  if (input.kind === "stage-2") {
    return {
      subject: `Cycle ${input.cycleNumber}: Stage 2 approved — ${topic}`,
      heading: "Stage 2 approved",
      paragraphs: [
        `${reviewer} approved Stage 2 for ${label}. It is now with executive producers (Stage 3).`,
        excerpt
      ].filter((paragraph): paragraph is string => Boolean(paragraph)),
      ctaLabel: "Open Initial Cut",
      pushTitle: "Stage 2 approved",
      pushBody: excerpt ? `${reviewer}: ${excerpt}` : `${label} is with executive producers (Stage 3).`
    };
  }

  return {
    subject: `Cycle ${input.cycleNumber}: approved for Final Cut — ${topic}`,
    heading: "Approved for Final Cut",
    paragraphs: [
      `${reviewer} completed Stage 3 for ${label}. You can upload your Final Cut.`,
      excerpt
    ].filter((paragraph): paragraph is string => Boolean(paragraph)),
    ctaLabel: "Open Final Cut",
    pushTitle: "Approved for Final Cut",
    pushBody: excerpt ? `${reviewer}: ${excerpt}` : `${label} is approved. You can upload your Final Cut.`
  };
}
