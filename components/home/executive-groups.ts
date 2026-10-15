import type { CycleDates, GroupRowView } from "@/app/(app)/groups/group-row-model";
import type { NeedItem } from "@/components/home/executive-needs";
import { classBoardReviewDates } from "@/src/lib/class-board";
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
