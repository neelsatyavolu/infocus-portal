import { InlineError } from "@/components/kit/alert";
import { Panel, PanelLink } from "@/components/kit/panel";
import { ValueRows } from "@/components/home/value-rows";
import type { StudentDashboardSnapshot } from "@/src/server/dashboard-data";

/**
 * This week's participation: the points and the week, then one row per scored class day in the
 * same row style as Grade, and the scoring rule as a footnote on the bottom edge. The header is
 * one title row, like every Home panel, so the first lines of cards side by side line up.
 * `snapshot` is null when it couldn't be loaded.
 */
export function ThisWeekPanel({ snapshot, className }: { snapshot: StudentDashboardSnapshot | null; className?: string }) {
  const week = snapshot?.thisWeek ?? null;
  const scored = week !== null && week.possible > 0;

  return (
    <Panel
      id="home-this-week"
      title="This week"
      titleAs="h2"
      className={className}
      actions={<PanelLink href="/grades">Participation</PanelLink>}
      bodyClassName="flex flex-col gap-4"
    >
      {!snapshot ? (
        <InlineError>Couldn&apos;t load this week. Reload the page to try again.</InlineError>
      ) : scored ? (
        <>
          <p className="flex min-w-0 items-baseline gap-3">
            <span className="shrink-0 font-mono-broadcast text-[22px] font-medium leading-none tabular-nums text-foreground">
              {week.earned} / {week.possible}
            </span>
            <span className="min-w-0 truncate text-sm text-muted-foreground">points · {week.label}</span>
          </p>
          <ValueRows
            aria-label="Class days"
            rows={week.days.map((day) => ({
              key: day.weekday,
              label: day.weekday,
              value: day.points === null ? "—" : `${day.points} / ${day.maxPoints}`
            }))}
          />
          <p className="mt-auto text-xs text-muted-foreground">Mon 10 · Tue/Thu 20 points</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No class days scored yet this week.</p>
      )}
    </Panel>
  );
}
