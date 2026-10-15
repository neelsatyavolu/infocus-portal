import Link from "next/link";
import { Check } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ActivityPanel } from "@/components/home/activity-panel";
import { GradePanel } from "@/components/home/grade-panel";
import { formatDueTagLabel, shortStageLabel, stageDueDays, stageDueTone } from "@/components/home/home-format";
import { MyPackagePanel } from "@/components/home/my-package-panel";
import { ThisWeekPanel } from "@/components/home/this-week-panel";
import { homeStageSteps } from "@/src/lib/home-stages";
import type { DashboardActivityEntry, DashboardUpNext, StudentDashboardSnapshot } from "@/src/server/dashboard-data";

/**
 * Student Home. The header is the whole next step: the due tag (or "All submitted") beside the
 * eyebrow, the package (topic, people) as the one line of context, and one Open button for the
 * current stage. Unread producer notes show once, in My package's Feedback cell. Below, one
 * grid: My package (2/3: the stages and the numbers) with Grade (1/3) on the first row, Your
 * activity (2/3) with This week (1/3) on the second, so both rows share one column line and
 * every panel opens with a single title row. From md to
 * xl: My package, then Grade | This week, then Activity. Without a package: Grade | This week
 * (similar heights, so neither card stretches), then Activity across the full width. `snapshot` is null when the grade snapshot failed to load (panels show the error).
 */
export function StudentHome({
  firstName,
  upNext,
  activity,
  snapshot,
  peopleLine
}: {
  firstName: string | null;
  upNext: DashboardUpNext | null;
  activity: DashboardActivityEntry[];
  snapshot: StudentDashboardSnapshot | null;
  peopleLine: string | null;
}) {
  const steps = upNext ? homeStageSteps(upNext.stages) : [];
  const current = steps.find((step) => step.tone === "current") ?? null;
  const allSubmitted = upNext !== null && current === null;
  const currentDue = current ? formatDueTagLabel(current.dueDate) : null;

  const tags = [
    current ? (
      currentDue ? (
        <StatusTag key="due" tone={stageDueTone(stageDueDays(current.dueDate))}>
          {currentDue}
        </StatusTag>
      ) : (
        <StatusTag key="due" tone="neutral">
          Submit when ready
        </StatusTag>
      )
    ) : allSubmitted ? (
      <StatusTag key="due" tone="success" icon={Check}>
        All submitted
      </StatusTag>
    ) : null
  ].filter(Boolean);

  const description = upNext ? (
    <>
      <span className="font-medium text-foreground">{upNext.groupTopic?.trim() || "Untitled package"}</span>
      {peopleLine ? ` · ${peopleLine}` : null}
    </>
  ) : (
    "You aren't on a package this cycle yet. Ask a producer to add you."
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow={upNext ? `Cycle ${upNext.cycleNumber}` : snapshot?.semesterLabel}
        status={tags.length > 0 ? tags : null}
        title={firstName ? `Hi, ${firstName}` : "Dashboard"}
        description={description}
        actions={
          current ? (
            <Link href={current.href as never} aria-label={`Open ${current.label}`} className={buttonVariants()}>
              Open {shortStageLabel(current.key)}
            </Link>
          ) : null
        }
      />

      {upNext ? (
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          <MyPackagePanel
            upNext={upNext}
            steps={steps}
            unreadFeedback={snapshot ? snapshot.unreadFeedback : null}
            extensions={snapshot ? { remaining: snapshot.extensionsRemaining, bank: snapshot.extensionBank } : null}
            className="md:col-span-2"
          />
          <GradePanel snapshot={snapshot} />
          <ThisWeekPanel snapshot={snapshot} className="xl:col-start-3 xl:row-start-2" />
          <ActivityPanel activity={activity} className="md:col-span-2 xl:col-start-1 xl:row-start-2" />
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          <GradePanel snapshot={snapshot} />
          <ThisWeekPanel snapshot={snapshot} />
          <ActivityPanel activity={activity} className="md:col-span-2" />
        </div>
      )}
    </div>
  );
}
