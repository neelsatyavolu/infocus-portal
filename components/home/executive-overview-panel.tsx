import { InlineError } from "@/components/kit/alert";
import { Panel, PanelLink } from "@/components/kit/panel";
import { SectionLabel } from "@/components/kit/section";
import { ValueRows } from "@/components/home/value-rows";
import type { ClassOverview } from "@/components/home/executive-groups";
import { plural } from "@/components/home/home-format";
import { cn } from "@/src/lib/utils";

function Count({ value, tone }: { value: number; tone?: "danger" }) {
  return <span className={cn(value === 0 ? "text-muted-foreground" : tone === "danger" && "text-danger")}>{value}</span>;
}

/**
 * The cycle's groups by the stage each is waiting in, then the ones behind schedule and the ones
 * that owe revisions. Every row opens Groups. `overview` is null when the roster didn't load.
 */
export function ExecutiveOverviewPanel({ overview, className }: { overview: ClassOverview | null; className?: string }) {
  return (
    <Panel
      id="home-overview"
      title="Class overview"
      titleAs="h2"
      className={className}
      actions={<PanelLink href="/groups">Groups</PanelLink>}
      bodyClassName="flex flex-col gap-4"
    >
      {!overview ? (
        <InlineError>Couldn&apos;t load the groups. Reload the page to try again.</InlineError>
      ) : overview.total === 0 ? (
        <p className="text-sm text-muted-foreground">No groups in this cycle yet.</p>
      ) : (
        <>
          <div>
            <SectionLabel end={plural(overview.total, "group")}>By stage</SectionLabel>
            <ValueRows
              aria-label="Groups by stage"
              className="mt-1"
              rows={overview.stages.map((stage) => ({
                key: stage.key,
                label: stage.label,
                value: <Count value={stage.count} />,
                href: "/groups"
              }))}
            />
          </div>
          <ValueRows
            aria-label="Groups that need a look"
            rows={[
              { key: "behind", label: "Behind schedule", value: <Count value={overview.behind} tone="danger" />, href: "/groups" },
              {
                key: "revisions",
                label: "Revisions requested",
                value: <Count value={overview.revisions} tone="danger" />,
                href: "/groups"
              }
            ]}
          />
        </>
      )}
    </Panel>
  );
}
