import { ListRow } from "@/components/kit/list-row";
import { Panel, PanelLink } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { EmptyLine, HOME_LIST_LIMIT, MoreLink, PanelError } from "@/components/home/executive-list";
import type { LivestreamRow } from "@/components/home/executive-calendar";

/** Livestreams in the next 14 days: when, crew against capacity, and sign-ups to review. */
export function ExecutiveLivestreamsPanel({ rows, className }: { rows: LivestreamRow[] | null; className?: string }) {
  const shown = rows?.slice(0, HOME_LIST_LIMIT) ?? [];
  return (
    <Panel
      id="home-livestreams"
      title="Upcoming livestreams"
      titleAs="h2"
      count={rows && rows.length > 0 ? rows.length : null}
      padding="none"
      className={className}
      actions={<PanelLink href="/livestreams">Livestreams</PanelLink>}
      footer={rows && rows.length > shown.length ? <MoreLink hidden={rows.length - shown.length} href="/livestreams" /> : null}
    >
      {!rows ? (
        <PanelError>Couldn&apos;t load the livestreams.</PanelError>
      ) : rows.length === 0 ? (
        <EmptyLine>No livestreams in the next two weeks.</EmptyLine>
      ) : (
        <ul aria-label="Upcoming livestreams" className="divide-y divide-border">
          {shown.map((row) => (
            <ListRow
              key={row.id}
              href="/livestreams"
              title={row.title}
              tags={row.pending > 0 ? <StatusTag tone="warning">{`${row.pending} to review`}</StatusTag> : null}
              meta={<StatusTag tone={row.crew >= row.capacity ? "success" : "neutral"}>{row.openLabel}</StatusTag>}
              subtitle={`${row.when} · crew ${row.crew} of ${row.capacity}`}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
