import Link from "next/link";
import { GridList, GridListCell, GridListRow } from "@/components/kit/data-table";
import { Panel, PanelLink } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { EmptyLine, PanelError } from "@/components/home/executive-list";
import type { ShowDayRow } from "@/components/home/executive-calendar";

const COLUMNS = "8.5rem 3.5rem minmax(0,1fr) minmax(0,1.4fr) 12rem";

function names(list: string[]) {
  return list.length > 0 ? list.join(" & ") : "—";
}

/**
 * Show and PA days in the next 14 days, from the Master Calendar's day model: who's on air, what's
 * queued, and small tags for what's missing. A table from md, stacked rows on phones. The day
 * opens the Master Calendar; a package opens the Publishing Queue.
 */
export function ExecutiveShowsPanel({ rows, className }: { rows: ShowDayRow[] | null; className?: string }) {
  return (
    <Panel
      id="home-shows"
      title="Upcoming shows"
      titleAs="h2"
      padding="none"
      className={className}
      actions={<PanelLink href="/master-calendar">Master Calendar</PanelLink>}
    >
      {!rows ? (
        <PanelError>Couldn&apos;t load the calendar. Reload the page to try again.</PanelError>
      ) : rows.length === 0 ? (
        <EmptyLine>No show or PA days in the next two weeks.</EmptyLine>
      ) : (
        <GridList
          aria-label="Upcoming show and PA days"
          columns={COLUMNS}
          className="rounded-none border-0"
          header={[{ label: "Day" }, { label: "Type" }, { label: "On air" }, { label: "Packages" }, { label: "Missing", align: "end" }]}
        >
          {rows.map((row) => (
            <GridListRow key={row.dateKey}>
              <GridListCell label="Day">
                <Link
                  href="/master-calendar"
                  className="font-medium text-foreground hover:text-[var(--brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row.dateLabel}
                </Link>
                {row.label ? <span className="block truncate text-xs text-muted-foreground">{row.label}</span> : null}
              </GridListCell>
              <GridListCell label="Type">
                {row.kind === "SHOW" ? "Show" : "PA"}
              </GridListCell>
              <GridListCell label="On air">
                <span className="text-muted-foreground">
                  {row.kind === "SHOW" ? names(row.anchors) : names(row.paNames)}
                </span>
              </GridListCell>
              <GridListCell label="Packages">
                {row.kind === "PA" ? (
                  <span className="text-muted-foreground">—</span>
                ) : row.packages.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  row.packages.map((pkg, index) => (
                    <span key={pkg.id}>
                      {index > 0 ? ", " : null}
                      <Link href="/publishing-queue" className="text-foreground hover:text-[var(--brand-green)]">
                        {pkg.title}
                      </Link>
                    </span>
                  ))
                )}
              </GridListCell>
              <GridListCell label="Missing" align="end">
                {row.missing.length === 0 ? (
                  <StatusTag tone="success">Set</StatusTag>
                ) : (
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    {row.missing.map((tag) => (
                      <StatusTag key={tag} tone="warning">
                        {tag}
                      </StatusTag>
                    ))}
                  </span>
                )}
              </GridListCell>
            </GridListRow>
          ))}
        </GridList>
      )}
    </Panel>
  );
}
