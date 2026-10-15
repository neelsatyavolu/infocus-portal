import { ListRow } from "@/components/kit/list-row";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { EmptyLine, HOME_LIST_LIMIT, MoreLink, PanelError } from "@/components/home/executive-list";
import type { GradingQueueRow } from "@/components/home/executive-groups";

function scoringDetail(row: GradingQueueRow, gradersLoaded: boolean) {
  if (!gradersLoaded) return "Scores still owed";
  if (row.owing.length === 0) return "All scores in, grade not final yet";
  return `Waiting on ${row.owing.join(", ")}`;
}

/**
 * Grading queue: Final Cuts turned in this cycle that aren't fully graded (who still owes a
 * score), then groups graded but not published. `rows` is null when the roster didn't load;
 * `gradersLoaded` is false when the grader names didn't.
 */
export function ExecutiveGradingPanel({
  rows,
  gradersLoaded,
  className
}: {
  rows: GradingQueueRow[] | null;
  gradersLoaded: boolean;
  className?: string;
}) {
  const shown = rows?.slice(0, HOME_LIST_LIMIT) ?? [];
  return (
    <Panel
      id="home-grading"
      title="Grading queue"
      titleAs="h2"
      count={rows?.length ?? null}
      padding="none"
      className={className}
      footer={rows && rows.length > shown.length ? <MoreLink hidden={rows.length - shown.length} href="/grade-editor" /> : null}
    >
      {!rows ? (
        <PanelError>Couldn&apos;t load the grades. Reload the page to try again.</PanelError>
      ) : rows.length === 0 ? (
        <EmptyLine>No Final Cuts waiting on grades.</EmptyLine>
      ) : (
        <ul aria-label="Grading queue" className="divide-y divide-border">
          {shown.map((row) => (
            <ListRow
              key={row.key}
              href={row.href}
              title={row.topic}
              tags={row.forViewer ? <StatusTag tone="info">You</StatusTag> : null}
              meta={
                row.state === "scoring" ? (
                  <StatusTag tone="warning">{gradersLoaded ? `${row.scored} of ${row.graders} scored` : "Scoring"}</StatusTag>
                ) : (
                  <StatusTag tone="neutral">Not published</StatusTag>
                )
              }
              subtitle={[row.state === "scoring" ? scoringDetail(row, gradersLoaded) : "Graded", row.members]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
