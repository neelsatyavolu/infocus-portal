import { InlineError } from "@/components/kit/alert";
import { Panel, PanelLink } from "@/components/kit/panel";
import { SectionLabel } from "@/components/kit/section";
import { ValueRows } from "@/components/home/value-rows";
import type { WeekDeadline, WeekEvent } from "@/src/server/executive-dashboard";

function deadlineWhen(deadline: WeekDeadline) {
  if (deadline.daysUntil <= 0) return "Today";
  if (deadline.daysUntil === 1) return "Tomorrow";
  return deadline.dateLabel;
}

/**
 * The next two weeks of stage deadlines, then the shows and livestreams in the next 7 days.
 * Either list is null when it couldn't be loaded.
 */
export function ExecutiveWeekPanel({
  deadlines,
  events,
  className
}: {
  deadlines: WeekDeadline[] | null;
  events: WeekEvent[] | null;
  className?: string;
}) {
  return (
    <Panel
      id="home-week"
      title="This week"
      titleAs="h2"
      className={className}
      actions={<PanelLink href="/master-calendar">Calendar</PanelLink>}
      bodyClassName="flex flex-col gap-4"
    >
      <div>
        <SectionLabel>Deadlines</SectionLabel>
        {!deadlines ? (
          <InlineError className="mt-2">Couldn&apos;t load the cycle dates.</InlineError>
        ) : deadlines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No stage deadlines in the next two weeks.</p>
        ) : (
          <ValueRows
            aria-label="Stage deadlines"
            className="mt-1"
            rows={deadlines.map((deadline) => ({ key: deadline.key, label: deadline.label, value: deadlineWhen(deadline) }))}
          />
        )}
      </div>
      <div>
        <SectionLabel>Shows and livestreams</SectionLabel>
        {!events ? (
          <InlineError className="mt-2">Couldn&apos;t load the calendar.</InlineError>
        ) : events.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No shows or livestreams in the next 7 days.</p>
        ) : (
          <ValueRows
            aria-label="Shows and livestreams"
            className="mt-1"
            rows={events.map((event) => ({ key: event.key, label: event.title, value: event.dateLabel, href: event.href }))}
          />
        )}
      </div>
    </Panel>
  );
}
