"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, MessageSquareText, Users } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Disclosure } from "@/components/kit/disclosure";
import { ProgressBar } from "@/components/kit/progress";
import { SectionLabel } from "@/components/kit/section";
import { MetricStrip } from "@/components/kit/stat-tile";
import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import { ASSOCIATE_STAGE_LABELS, type AssociatePerformance, type AssociateStageSample } from "@/src/lib/associate-performance";

function formatResponseTime(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  return hours < 48 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(hours / 24 * 10) / 10}d`;
}

/** A group stage page; initial-cut reviews open Stage 1. */
export function associateStageHref(rowId: string, stage: string) {
  return `/groups/${rowId}/${stage === "initial-cut" ? "initial-stage-1" : stage}`;
}

/** "Initial cut" rather than the raw slug; unknown stages show as given. */
export function associateStageLabel(stage: string) {
  return (ASSOCIATE_STAGE_LABELS as Record<string, string>)[stage] ?? stage;
}

function sampleStatus(sample: AssociateStageSample) {
  if (sample.respondedAt && !sample.submittedAt) return "Reviewed · timing unknown";
  if (sample.historicalUnknown) return "Reviewer unknown";
  if (sample.respondedAt && sample.submittedAt) {
    return formatResponseTime((Date.parse(sample.respondedAt) - Date.parse(sample.submittedAt)) / 3_600_000);
  }
  return "Awaiting review";
}

function milestoneTag(milestone: { complete: boolean; dueAt?: string | null }, now: number): { label: string; tone: StatusToneInput } {
  if (milestone.complete) return { label: "Complete", tone: "success" };
  if (!milestone.dueAt) return { label: "Unscheduled", tone: "neutral" };
  return Date.parse(milestone.dueAt) > now ? { label: "Not due", tone: "neutral" } : { label: "Pending", tone: "warning" };
}

function ScoreBreakdown({ associate }: { associate: AssociatePerformance }) {
  const metrics = associate.metrics;
  const items = [
    { label: "AI feedback quality", weight: 25, value: associate.quality.score, detail: "Specific, actionable, reasoned, constructive feedback" },
    { label: "Group progress", weight: 25, value: associate.progress.score, detail: "Completed milestones that are due, averaged across groups" },
    { label: "Responsiveness", weight: 25, value: metrics.responsiveness, detail: "First response within 48 hours" },
    { label: "Review coverage", weight: 10, value: metrics.reviewCoverage, detail: "Submitted stages with an attributed response" },
    { label: "Group feedback", weight: 10, value: associate.groupFeedback.score, detail: "Anonymous group ratings of helpfulness, communication and support" },
    { label: "Feedback coverage", weight: 5, value: metrics.feedbackCoverage, detail: "Eligible groups with written feedback" }
  ];
  return (
    <section aria-labelledby="associate-score-breakdown" className="space-y-3">
      <SectionLabel as="h4" id="associate-score-breakdown" rule>
        Score breakdown
      </SectionLabel>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                {item.label}
                <span className="ml-2 text-xs text-muted-foreground">{item.weight}% weight</span>
              </span>
              <span className="font-mono-broadcast text-[13px] tabular-nums">
                {item.value === null ? "—" : `${Math.round(item.value)}%`}
              </span>
            </div>
            <ProgressBar value={item.value} tone="success" label={item.label} />
            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Overview tab of the Associates dialog: review habits, score parts, evidence and due milestones. */
export function AssociatesOverview({ associate }: { associate: AssociatePerformance }) {
  const metrics = associate.metrics;
  const now = Date.now();
  return (
    <div className="space-y-6">
      <MetricStrip
        columns={3}
        items={[
          { key: "median", label: "Median response", value: formatResponseTime(metrics.medianHours), icon: Clock3 },
          {
            key: "verified",
            label: "Verified reviews",
            value: metrics.reviewed === 0 && metrics.unknown > 0 ? "—" : String(metrics.reviewed),
            icon: MessageSquareText
          },
          {
            key: "awaiting",
            label: "Known awaiting review",
            value: metrics.pending === 0 && metrics.unknown > 0 ? "—" : String(metrics.pending),
            icon: Users
          }
        ]}
      />

      {metrics.unknown > 0 || metrics.missingTiming > 0 ? (
        <Alert tone="neutral" compact>
          {metrics.reviewed} verified reviews. {metrics.missingTiming} lack submission timing; {metrics.unknown} other stages lack
          review history. Missing records do not mean no work was done.
        </Alert>
      ) : null}
      {metrics.overdue > 0 ? (
        <Alert tone="warning" compact>
          {metrics.overdue} stage {metrics.overdue === 1 ? "review has" : "reviews have"} waited at least 48 hours.
        </Alert>
      ) : null}

      <ScoreBreakdown associate={associate} />

      <Disclosure summary="How this score works" className="rounded-md border border-border px-4" bodyClassName="space-y-2 pb-4 text-[13px] leading-relaxed text-muted-foreground">
        <p className="max-w-prose">
          The first response to brainstorming, A-roll/B-roll, and initial cut v1 counts once per group and stage. A response is a
          comment, submitted review, or approval by this associate. Unanswered work has a 48-hour grace period. Hours include nights
          and weekends.
        </p>
        <p className="max-w-prose">
          The score combines the six components above. Missing components are excluded and the available weights are rescaled to 100;
          the result is labeled provisional. No feedback on eligible reviews gives quality zero; no eligible work is unscored. More
          comments do not earn extra points. Current assignments determine the groups shown; past reassignments are not reconstructed.
        </p>
        <p className="max-w-prose">
          Older upload times are estimates. Approvals without attribution are excluded. Verified comments and approvals still count
          toward coverage when submission timing is missing; only response speed is unavailable. Missing timing is excluded from
          responsiveness. {metrics.unknown} {metrics.unknown === 1 ? "stage has" : "stages have"} incomplete history.
        </p>
      </Disclosure>

      <section aria-labelledby="associate-review-evidence" className="space-y-2">
        <SectionLabel as="h4" id="associate-review-evidence" count={associate.samples.length} rule>
          Review evidence
        </SectionLabel>
        {associate.samples.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviewable work in this cycle yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {associate.samples.map((sample) => (
              <li key={`${sample.rowId}:${sample.stage}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={associateStageHref(sample.rowId, sample.stage) as never}
                    className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:text-[var(--brand-green)]"
                  >
                    <span className="truncate">{sample.topic}</span>
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {ASSOCIATE_STAGE_LABELS[sample.stage]}
                    {sample.estimated ? " · estimated timing" : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground">{sampleStatus(sample)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="associate-group-progress" className="space-y-2">
        <SectionLabel as="h4" id="associate-group-progress" count={associate.progress.groups.length} rule>
          Group progress
        </SectionLabel>
        <p className="max-w-prose text-[13px] leading-relaxed text-muted-foreground">
          Current milestone completion, not proof of individual impact. Future and undated milestones are excluded. Approved extensions
          move the final-cut deadline. Student effort and later reviewer decisions also affect progress.
        </p>
        {associate.progress.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assigned groups in this cycle.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {associate.progress.groups.map((group) => (
              <li key={group.rowId} className="space-y-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{group.topic}</span>
                  <span className="shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground">
                    {group.completed}/{group.due} due milestones
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.milestones.map((milestone) => {
                    const tag = milestoneTag(milestone, now);
                    return (
                      <StatusTag key={milestone.label} tone={tag.tone}>
                        {milestone.label} · {tag.label}
                      </StatusTag>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
