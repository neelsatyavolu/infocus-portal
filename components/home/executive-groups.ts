import type { CycleDates, GroupRowView } from "@/app/(app)/groups/group-row-model";
import type { NeedItem } from "@/components/home/executive-needs";
import { classBoardReviewDates } from "@/src/lib/class-board";
import { brainstormMaterialsReady } from "@/src/lib/package-brainstorm";
import { deadlineClosesAt } from "@/src/lib/deadlines";
import { effectiveDeadline } from "@/src/lib/package-extensions";
import { GROUP_NAV_SLUGS, GROUP_NAV_TAB_LABELS, type GroupNavSlug } from "@/src/lib/package-stages";
import { parseDateKeyUtc } from "@/src/lib/show-assignment";

/**
 * Pure helpers for the executive Home's group rows and Class overview. They read the Groups
 * page's own row view (buildGroupRowView), so a group opens the same stage and counts the same
 * way here as on /groups.
 */

/** What the viewer owes a group, by the stage it is waiting in. */
export const GROUP_NEED_LABELS: Record<GroupNavSlug, string> = {
  pitching: "Pitch to approve",
  brainstorming: "Brainstorm to review",
  "a-roll": "A/B-roll to review",
  "initial-stage-1": "Initial Cut, Stage 1 review",
  "initial-stage-2": "Stage 2 review",
  "initial-stage-3": "Stage 3 sign-off",
  "final-cut": "Final Cut grade from you"
};

/** When each stage became ready for review (ISO), per group. */
export type GroupReadySince = Partial<Record<GroupNavSlug, string | null>>;

function dateOrNull(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

/**
 * When the stage must be approved by: the cycle's check-in date (Initial Cut Stages 2 and 3 use
 * the Class Board dates, as the Groups schedule chip does), moved by the group's approved
 * extension, closing at 11:59 PM Pacific. Final Cut grading has no deadline here.
 */
export function stageReviewDeadline(slug: GroupNavSlug, dates: CycleDates | null, extensionDays: number): Date | null {
  if (!dates) return null;
  const review = classBoardReviewDates(dates.finalCut);
  const fromKey = (key: string | null) => (key ? parseDateKeyUtc(key) : null);
  const byStage: Record<GroupNavSlug, Date | null> = {
    pitching: dateOrNull(dates.pitching),
    brainstorming: dateOrNull(dates.proofOfContact),
    "a-roll": dateOrNull(dates.aRollBRoll),
    "initial-stage-1": dateOrNull(dates.initialCut),
    "initial-stage-2": fromKey(review.initialCutStage2),
    "initial-stage-3": fromKey(review.initialCutStage3),
    "final-cut": null
  };
  const deadline = effectiveDeadline(byStage[slug], extensionDays);
  return deadline ? deadlineClosesAt(deadline) : null;
}

/** One "Needs you" row for a group waiting on this viewer; null for every other group. */
export function groupNeedItem(view: GroupRowView, readySince: GroupReadySince, dates: CycleDates | null): NeedItem | null {
  if (view.attention !== "needed" || !view.href) return null;
  const slug = view.pendingSlug;
  const due = stageReviewDeadline(slug, dates, view.row.extensionDays ?? 0);
  return {
    key: `group-${view.key}`,
    kind: "group",
    title: view.topic,
    need: GROUP_NEED_LABELS[slug],
    href: view.href,
    dueAt: due?.toISOString() ?? null,
    waitingSince: readySince[slug] ?? null
  };
}

export type OverviewStageKey = GroupNavSlug | "done";

export type ClassOverview = {
  total: number;
  stages: Array<{ key: OverviewStageKey; label: string; count: number }>;
  behind: number;
  revisions: number;
};

/**
 * The cycle's groups by the stage each is waiting in (Done once every check-in is in), how many
 * are behind schedule, and how many owe revisions (the tile's red "Needs Revisions" status).
 */
export function buildClassOverview(views: readonly GroupRowView[]): ClassOverview {
  const counts = new Map<OverviewStageKey, number>();
  for (const view of views) {
    const key: OverviewStageKey = view.complete ? "done" : view.pendingSlug;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    total: views.length,
    stages: [
      ...GROUP_NAV_SLUGS.map((slug) => ({ key: slug, label: GROUP_NAV_TAB_LABELS[slug], count: counts.get(slug) ?? 0 })),
      { key: "done" as const, label: "Done", count: counts.get("done") ?? 0 }
    ],
    behind: views.filter((view) => (view.schedule?.daysBehind ?? 0) > 0).length,
    revisions: views.filter((view) => !view.complete && view.tileStatus.tone === "danger").length
  };
}

// ---------------------------------------------------------------------------------------------
// Review queue: every group whose submission waits on a review, for any reviewer.

/** Per-group facts the queues read beside the row view. */
export type GroupFacts = {
  view: GroupRowView;
  readySince: GroupReadySince;
  /** Display name of the group's assigned producer (the EP when set, else the AP). */
  assignedName: string | null;
  /** When the Final Cut was turned in (ISO). */
  finalCutSubmittedAt: string | null;
};

export type ReviewQueueRow = {
  key: string;
  topic: string;
  members: string;
  stage: string;
  waitingOn: string;
  href: string;
  waitingSince: string | null;
  dueAt: string | null;
  /** The viewer is one of the people it waits on. */
  forViewer: boolean;
  /** "Cycle 1" when the group is from an earlier cycle that still has open work. */
  cycleLabel?: string | null;
};

type ReviewStep = { stage: string; waitingOn: string; since: string | null; withDeadline: boolean };

function reviewStep(facts: GroupFacts): ReviewStep | null {
  const { view, readySince, assignedName } = facts;
  const row = view.row;
  const producer = assignedName ?? "Producer";
  // A turned-in Final Cut marks the group complete, but it still waits to be queued for air.
  if (row.approvalStage === "APPROVED" && row.finalCutMediaItemId && !row.queuedForAir) {
    return { stage: "Final Cut to queue", waitingOn: "Producers", since: facts.finalCutSubmittedAt, withDeadline: false };
  }
  if (view.complete) return null;
  switch (view.pendingSlug) {
    case "pitching":
      // A pitch is in once the group has a topic; any executive can approve it.
      return row.groupTopic.trim() ? { stage: "Pitch", waitingOn: "Execs", since: null, withDeadline: true } : null;
    case "brainstorming":
      return brainstormMaterialsReady(row.proofs?.length ?? 0, row.brainstormDocUrl ?? "") && !row.brainstormNeedsChanges
        ? { stage: "Brainstorm", waitingOn: producer, since: readySince.brainstorming ?? null, withDeadline: true }
        : null;
    case "a-roll":
      return row.aRollHasMedia && !row.aRollNeedsChanges
        ? { stage: "A/B-roll", waitingOn: producer, since: readySince["a-roll"] ?? null, withDeadline: true }
        : null;
    case "initial-stage-1":
      return row.approvalStage === "ASSOCIATE_REVIEW" &&
        row.initialCutMediaItemId &&
        !row.initialCutNeedsRevisions &&
        !row.awaitingRevisedInitialCut
        ? { stage: "Initial Cut · Stage 1", waitingOn: producer, since: readySince["initial-stage-1"] ?? null, withDeadline: true }
        : null;
    case "initial-stage-2":
      return row.initialCutNeedsRevisions
        ? null
        : { stage: "Initial Cut · Stage 2", waitingOn: "Adviser", since: readySince["initial-stage-2"] ?? null, withDeadline: true };
    case "initial-stage-3": {
      if (row.initialCutNeedsRevisions) return null;
      const left = row.remainingExecutiveSignoffs ?? null;
      const waitingOn = left && left > 0 ? `Execs · ${left} left` : "Execs";
      return { stage: "Initial Cut · Stage 3", waitingOn, since: readySince["initial-stage-3"] ?? null, withDeadline: true };
    }
    case "final-cut":
      return null;
  }
}

/** The group's review queue row, or null when nothing it turned in waits on a review. */
export function reviewQueueRow(facts: GroupFacts, dates: CycleDates | null): ReviewQueueRow | null {
  const step = reviewStep(facts);
  const { view } = facts;
  if (!step || !view.href) return null;
  const due = step.withDeadline ? stageReviewDeadline(view.pendingSlug, dates, view.row.extensionDays ?? 0) : null;
  return {
    key: view.key,
    topic: view.topic,
    members: view.memberNames,
    stage: step.stage,
    waitingOn: step.waitingOn,
    href: view.href,
    waitingSince: step.since,
    dueAt: due?.toISOString() ?? null,
    forViewer: step.withDeadline && view.attention === "needed"
  };
}

function ms(value: string | null) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Overdue first (the oldest deadline at the top), then longest waiting, then the topic. */
export function orderReviewQueue(rows: readonly ReviewQueueRow[], now: Date = new Date()): ReviewQueueRow[] {
  const nowMs = now.getTime();
  const overdue = (row: ReviewQueueRow) => {
    const due = ms(row.dueAt);
    return due !== null && due <= nowMs ? due : null;
  };
  const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
  return [...rows].sort(
    (a, b) =>
      nullsLast(overdue(a), overdue(b)) || nullsLast(ms(a.waitingSince), ms(b.waitingSince)) || a.topic.localeCompare(b.topic)
  );
}

// ---------------------------------------------------------------------------------------------
// Grading queue: Final Cuts turned in and not fully graded, then graded but not published.

export type Grader = { userId: string; name: string | null; email: string | null };

export type GradingQueueRow = {
  key: string;
  topic: string;
  members: string;
  state: "scoring" | "unpublished";
  /** Graders who still owe a score (names). Empty when the scores are in or for unpublished rows. */
  owing: string[];
  scored: number;
  graders: number;
  href: string;
  since: string | null;
  forViewer: boolean;
  /** "Cycle 1" when the group is from an earlier cycle that still has open work. */
  cycleLabel?: string | null;
};

function graderName(grader: Grader) {
  return grader.name?.trim() || grader.email || "Grader";
}

/**
 * Scoring rows: the graders who haven't scored every member still waiting on a grade (the
 * Groups page's own done list, finalCutScoredByUserIds). Unpublished rows: every member has an
 * official grade, not every grade is published. Scoring rows come first, longest waiting first.
 */
export function buildGradingQueue(
  facts: readonly GroupFacts[],
  graders: readonly Grader[] | null,
  viewerId: string
): GradingQueueRow[] {
  const rows = facts.flatMap(({ view, finalCutSubmittedAt }): GradingQueueRow[] => {
    const row = view.row;
    if (!row.id || !row.finalCutMediaItemId) return [];
    const base = { key: view.key, topic: view.topic, members: view.memberNames, since: finalCutSubmittedAt };
    if (!row.finalCutGraded) {
      const done = new Set(row.finalCutScoredByUserIds ?? []);
      const owing = (graders ?? []).filter((grader) => !done.has(grader.userId));
      return [
        {
          ...base,
          state: "scoring",
          owing: owing.map(graderName),
          scored: (graders ?? []).length - owing.length,
          graders: (graders ?? []).length,
          href: `/groups/${row.id}/final-cut`,
          forViewer: owing.some((grader) => grader.userId === viewerId)
        }
      ];
    }
    if (!row.finalCutGradesPublished) {
      return [{ ...base, state: "unpublished", owing: [], scored: 0, graders: 0, href: "/grade-editor", forViewer: false }];
    }
    return [];
  });
  const stateRank = (row: GradingQueueRow) => (row.state === "scoring" ? 0 : 1);
  return rows.sort(
    (a, b) =>
      stateRank(a) - stateRank(b) || (ms(a.since) ?? Infinity) - (ms(b.since) ?? Infinity) || a.topic.localeCompare(b.topic)
  );
}

// ---------------------------------------------------------------------------------------------
// Recent class activity, from what the roster already carries.

export type GroupActivitySource = {
  key: string;
  topic: string;
  href: string;
  signoffs: Array<{ stage: string; approved: boolean; createdAt: Date; actorName: string | null }>;
  brainstormReadyAt: string | null;
  aRollAt: Date | null;
  cutVersion: { versionNumber: number; createdAt: Date } | null;
  finalCutAt: Date | null;
  queuedAt: Date | null;
  gradesPublishedAt: Date | null;
};

export type ActivityEntry = { key: string; at: string; topic: string; text: string; href: string };

const SIGNOFF_STAGE: Record<string, string> = {
  ASSOCIATE_REVIEW: "Stage 1",
  ADVISER_REVIEW: "Stage 2",
  EXECUTIVE_REVIEW: "Stage 3"
};

/** One group's events: sign-offs, uploads, Final Cut, queued for air, grades published. */
export function groupActivity(source: GroupActivitySource): ActivityEntry[] {
  const entries: Array<{ at: Date | string | null; text: string; id: string }> = [
    ...source.signoffs.map((signoff, index) => {
      const stage = SIGNOFF_STAGE[signoff.stage] ?? "Initial Cut";
      const who = signoff.actorName ?? "A reviewer";
      return {
        id: `signoff-${index}`,
        at: signoff.createdAt,
        text: signoff.approved ? `${who} approved ${stage}` : `${who} asked for revisions at ${stage}`
      };
    }),
    { id: "brainstorm", at: source.brainstormReadyAt, text: "Brainstorm sent for review" },
    { id: "a-roll", at: source.aRollAt, text: "A/B-roll uploaded" },
    {
      id: "cut",
      at: source.cutVersion?.createdAt ?? null,
      text: `Initial Cut V${source.cutVersion?.versionNumber ?? 1} uploaded`
    },
    { id: "final", at: source.finalCutAt, text: "Final Cut turned in" },
    { id: "queued", at: source.queuedAt, text: "Queued for air" },
    { id: "published", at: source.gradesPublishedAt, text: "Grades published" }
  ];
  return entries.flatMap((entry) => {
    if (!entry.at) return [];
    const at = typeof entry.at === "string" ? entry.at : entry.at.toISOString();
    return [{ key: `${source.key}-${entry.id}`, at, topic: source.topic, text: entry.text, href: source.href }];
  });
}

/** The newest events across the class. */
export function latestActivity(sources: readonly GroupActivitySource[], limit = 10): ActivityEntry[] {
  return sources
    .flatMap(groupActivity)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
