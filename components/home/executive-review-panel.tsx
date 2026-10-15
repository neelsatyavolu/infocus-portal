import { ListRow } from "@/components/kit/list-row";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { EmptyLine, HOME_LIST_LIMIT, MoreLink, PanelError } from "@/components/home/executive-list";
import type { ReviewQueueRow } from "@/components/home/executive-groups";
import { deadlineSoonTag, waitingAge } from "@/components/home/executive-needs";

function rowDetail(row: ReviewQueueRow, now: Date) {
  const waited = row.waitingSince ? waitingAge(new Date(row.waitingSince), now) : null;
  return [row.stage, `waiting on ${row.waitingOn}${waited ? ` for ${waited}` : ""}`, row.members].filter(Boolean).join(" · ");
}

/**
 * Review queue (P0): every group whose submission waits on a review, for any reviewer, overdue
 * first and then longest waiting. "You" marks the ones waiting on the viewer. `rows` is null when
 * the roster didn't load.
 */
export function ExecutiveReviewPanel({ rows, now, className }: { rows: ReviewQueueRow[] | null; now: Date; className?: string }) {
  const shown = rows?.slice(0, HOME_LIST_LIMIT) ?? [];
  return (
    <Panel
      id="home-review"
      title="Review queue"
      titleAs="h2"
      count={rows?.length ?? null}
      status={<StatusTag tone="danger">P0</StatusTag>}
      padding="none"
      className={className}
      footer={rows && rows.length > shown.length ? <MoreLink hidden={rows.length - shown.length} href="/groups" /> : null}
    >
      {!rows ? (
        <PanelError>Couldn&apos;t load the groups. Reload the page to try again.</PanelError>
      ) : rows.length === 0 ? (
        <EmptyLine>Nothing waiting on a review.</EmptyLine>
      ) : (
        <ul aria-label="Review queue" className="divide-y divide-border">
          {shown.map((row) => {
            const deadline = deadlineSoonTag(row.dueAt, now);
            return (
              <ListRow
                key={row.key}
                href={row.href}
                title={row.topic}
                tags={
                  row.forViewer || row.cycleLabel ? (
                    <>
                      {row.cycleLabel ? <StatusTag tone="neutral">{row.cycleLabel}</StatusTag> : null}
                      {row.forViewer ? <StatusTag tone="info">You</StatusTag> : null}
                    </>
                  ) : null
                }
                meta={deadline ? <StatusTag tone={deadline.tone}>{deadline.label}</StatusTag> : null}
                subtitle={rowDetail(row, now)}
              />
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
