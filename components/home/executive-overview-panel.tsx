import Link from "next/link";
import { InlineError } from "@/components/kit/alert";
import { Panel, PanelLink } from "@/components/kit/panel";
import type { ClassOverview } from "@/components/home/executive-groups";
import { cn } from "@/src/lib/utils";

type Cell = { key: string; label: string; count: number; danger?: boolean };

function CountCell({ cell }: { cell: Cell }) {
  const zero = cell.count === 0;
  return (
    <li>
      <Link
        href="/groups"
        className="flex h-full min-w-0 flex-col justify-between gap-1 rounded-md px-3 py-2.5 transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "font-mono-broadcast text-2xl leading-none tabular-nums",
            zero ? "text-muted-foreground" : cell.danger ? "text-danger" : "text-foreground"
          )}
        >
          {cell.count}
        </span>
        <span className="truncate text-xs text-muted-foreground">{cell.label}</span>
      </Link>
    </li>
  );
}

/**
 * The cycle's groups across the page: how many wait in each stage, then (after a rule) how many
 * are behind schedule and how many owe revisions. Every count opens Groups. `overview` is null
 * when the roster didn't load.
 */
export function ExecutiveOverviewPanel({ overview, className }: { overview: ClassOverview | null; className?: string }) {
  return (
    <Panel
      id="home-overview"
      title="Class overview"
      titleAs="h2"
      count={overview && overview.total > 0 ? overview.total : null}
      className={className}
      actions={<PanelLink href="/groups">Groups</PanelLink>}
    >
      {!overview ? (
        <InlineError>Couldn&apos;t load the groups. Reload the page to try again.</InlineError>
      ) : overview.total === 0 ? (
        <p className="text-sm text-muted-foreground">No groups in this cycle yet.</p>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <ol
            aria-label="Groups by stage"
            className="grid min-w-0 flex-1 grid-cols-4 gap-1 sm:grid-cols-8"
          >
            {overview.stages.map((stage) => (
              <CountCell key={stage.key} cell={{ key: stage.key, label: stage.label, count: stage.count }} />
            ))}
          </ol>
          <ul
            aria-label="Groups that need a look"
            className="grid grid-cols-2 gap-1 border-border max-lg:border-t max-lg:pt-3 lg:w-64 lg:border-l lg:pl-3"
          >
            <CountCell cell={{ key: "behind", label: "Behind schedule", count: overview.behind, danger: true }} />
            <CountCell cell={{ key: "revisions", label: "Revisions requested", count: overview.revisions, danger: true }} />
          </ul>
        </div>
      )}
    </Panel>
  );
}
