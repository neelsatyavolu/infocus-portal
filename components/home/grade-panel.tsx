import { InlineError } from "@/components/kit/alert";
import { Panel, PanelLink } from "@/components/kit/panel";
import { formatHours } from "@/components/home/home-format";
import { ValueRows } from "@/components/home/value-rows";
import type { StudentDashboardSnapshot } from "@/src/server/dashboard-data";

function earnedOf({ earned, possible }: { earned: number; possible: number }) {
  return possible > 0 ? `${earned} / ${possible}` : "—";
}

/**
 * The student's estimated grade: the letter beside the percentage and semester, then the three
 * parts as link rows pinned to the bottom (so they end on the same line as My package's number
 * strip beside it). The header is one title row, like every Home panel, so bodies in a grid row
 * start on one line. `snapshot` is null when the grade couldn't be loaded.
 */
export function GradePanel({ snapshot, className }: { snapshot: StudentDashboardSnapshot | null; className?: string }) {
  return (
    <Panel
      id="home-grade"
      title="Grade"
      titleAs="h2"
      className={className}
      actions={<PanelLink href="/grades">All grades</PanelLink>}
      bodyClassName="flex flex-col gap-4"
    >
      {snapshot ? (
        <>
          <p className="flex items-baseline gap-3">
            <span
              className={
                snapshot.letter
                  ? "text-4xl font-semibold leading-none tracking-tight text-[var(--brand-green)]"
                  : "text-4xl font-semibold leading-none tracking-tight text-muted-foreground"
              }
            >
              {snapshot.letter ?? "—"}
            </span>
            <span className="min-w-0 text-sm text-muted-foreground">
              {snapshot.percentage === null ? "Not gradeable yet" : `${snapshot.percentage.toFixed(1)}% estimated`} ·{" "}
              {snapshot.semesterLabel}
            </span>
          </p>
          <ValueRows
            aria-label="Grade parts"
            className="mt-auto"
            rows={[
              { key: "packages", label: "Packages · 55%", value: earnedOf(snapshot.packages), href: "/grades" },
              { key: "participation", label: "Participation · 35%", value: earnedOf(snapshot.participation), href: "/grades" },
              {
                key: "livestream",
                label: "Livestream",
                value: `${formatHours(snapshot.livestreamHours)} / ${snapshot.requiredLivestreamHours}h${
                  snapshot.livestreamPoints === null ? "" : ` · ${snapshot.livestreamPoints} pts`
                }`,
                href: "/livestreams"
              }
            ]}
          />
        </>
      ) : (
        <InlineError>Couldn&apos;t load your grade. Reload the page to try again.</InlineError>
      )}
    </Panel>
  );
}
