import type { ReactNode } from "react";
import { MainWithRail } from "@/components/kit/layout";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { ExecutiveNeedsPanel } from "@/components/home/executive-needs-panel";
import { ExecutiveOverviewPanel } from "@/components/home/executive-overview-panel";
import { ExecutiveWeekPanel } from "@/components/home/executive-week-panel";
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
 * many things wait on the viewer and how many groups are behind. Below: Needs you (the list,
 * first on phones) with Class overview and This week in a rail from lg, then the producer
 * Projects view (`projects`) under its own heading.
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

      <MainWithRail
        breakpoint="lg"
        railWidth="22rem"
        rail={
          <>
            <ExecutiveOverviewPanel overview={dashboard.overview} />
            <ExecutiveWeekPanel deadlines={dashboard.deadlines} events={dashboard.events} />
          </>
        }
      >
        <ExecutiveNeedsPanel needs={dashboard.needs} failed={dashboard.failed} now={now} />
      </MainWithRail>

      <section aria-labelledby="home-projects-heading" className="pt-2">
        {projects}
      </section>
    </div>
  );
}
