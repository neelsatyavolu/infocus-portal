import type { ReactNode } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { ExecutiveNeedsPanel } from "@/components/home/executive-needs-panel";
import { ExecutiveOverviewPanel } from "@/components/home/executive-overview-panel";
import { ExecutiveWeekPanel } from "@/components/home/executive-week-panel";
import { ExecutiveReviewPanel } from "@/components/home/executive-review-panel";
import { ExecutiveGradingPanel } from "@/components/home/executive-grading-panel";
import { ExecutiveShowsPanel } from "@/components/home/executive-shows-panel";
import { ExecutiveLivestreamsPanel } from "@/components/home/executive-livestreams-panel";
import { ExecutiveActivityPanel } from "@/components/home/executive-activity-panel";
import type { ExecutiveDashboard, WeekDeadline } from "@/src/server/executive-dashboard";

function nextDeadlineLine(deadlines: WeekDeadline[] | null) {
  const next = deadlines?.[0];
  if (!deadlines) return null;
  if (!next) return "No stage deadlines in the next two weeks.";
  const when = next.daysUntil <= 0 ? "today" : next.daysUntil === 1 ? "tomorrow" : next.dateLabel;
  return `Next deadline: ${next.label}, ${when}`;
}

/**
 * Home for executives, the adviser and super admin (/dashboard). The header says the cycle, how
 * many things wait on the viewer and how many groups are behind. Below: Needs you beside This
 * week (the list first on phones), Class overview across the page, the class Review queue beside
 * the Grading queue, Upcoming shows across the page, Upcoming livestreams beside Recent class
 * activity, then the producer Projects view (`projects`). Paired panels share a row height.
 */
export function ExecutiveHome({
  firstName,
  dashboard,
  now,
  projects
}: {
  firstName: string | null;
  dashboard: ExecutiveDashboard;
  now: Date;
  projects: ReactNode;
}) {
  const needCount = dashboard.needs.length;
  const behind = dashboard.overview?.behind ?? 0;
  const tags = [
    needCount > 0 ? (
      <StatusTag key="needs" tone="warning">
        {needCount === 1 ? "1 needs you" : `${needCount} need you`}
      </StatusTag>
    ) : null,
    behind > 0 ? (
      <StatusTag key="behind" tone="danger">
        {`${behind} behind`}
      </StatusTag>
    ) : null
  ].filter(Boolean);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow={dashboard.cycleNumber !== null ? `Cycle ${dashboard.cycleNumber}` : "Dashboard"}
        status={tags.length > 0 ? tags : null}
        title={firstName ? `Hi, ${firstName}` : "Dashboard"}
        description={nextDeadlineLine(dashboard.deadlines)}
      />

      {/* Two short lists side by side (the list first on phones), then the class across the page. */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ExecutiveNeedsPanel needs={dashboard.needs} failed={dashboard.failed} now={now} />
        <ExecutiveWeekPanel deadlines={dashboard.deadlines} events={dashboard.events} />
      </div>
      <ExecutiveOverviewPanel overview={dashboard.overview} />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <ExecutiveReviewPanel rows={dashboard.reviewQueue} now={now} />
        <ExecutiveGradingPanel rows={dashboard.gradingQueue} gradersLoaded={dashboard.gradersLoaded} />
      </div>
      <ExecutiveShowsPanel rows={dashboard.showDays} />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <ExecutiveLivestreamsPanel rows={dashboard.livestreams} />
        <ExecutiveActivityPanel entries={dashboard.activity} now={now} />
      </div>

      <section aria-labelledby="home-projects-heading" className="pt-2">
        {projects}
      </section>
    </div>
  );
}
