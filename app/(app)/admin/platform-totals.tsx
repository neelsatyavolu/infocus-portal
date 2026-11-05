import { FileVideo2, FolderKanban, HardDrive, Link2, MessageCircle, Users } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { SettingsSection } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS } from "./admin-ui";
import { formatStorage, type PlatformStats } from "./admin-types";

type Cell = { Icon: typeof Users; label: string; value: string | number | null; detail: string | null };

function cellsFor(stats: PlatformStats | null): Cell[] {
  const totals = stats?.totals;
  return [
    { Icon: Users, label: "Users", value: totals?.users ?? null, detail: totals ? `${totals.roleAssignments} elevated roles` : null },
    { Icon: FolderKanban, label: "Workspaces", value: totals?.workspaces ?? null, detail: totals ? `${totals.projects} projects` : null },
    { Icon: FileVideo2, label: "Media", value: totals?.activeMedia ?? null, detail: totals ? `${totals.versions} versions tracked` : null },
    {
      Icon: HardDrive,
      label: "Storage",
      value: stats ? formatStorage(stats.storage.estimatedBytes) : null,
      detail: stats ? (stats.storage.isEstimated ? "Estimated usage" : "Synced usage") : null
    },
    { Icon: MessageCircle, label: "Comments", value: totals?.comments ?? null, detail: totals ? "Review conversations" : null },
    { Icon: Link2, label: "Share links", value: totals?.activeShareLinks ?? null, detail: totals ? "Active guest links" : null }
  ];
}

/**
 * Admin → Overview: six platform totals in one hairline strip (2 across on phones, 3 at medium
 * widths, 6 on wide content). Each cell pulses until the background stats load. If they can't
 * load, the cells read "—" and one line under the strip says why.
 */
export function PlatformTotals({ stats, error }: { stats: PlatformStats | null; error: string | null }) {
  const loading = stats === null && !error;
  return (
    <SettingsSection id="admin-totals" title="Platform totals">
      <div className="overflow-hidden rounded-md border border-border bg-card" aria-busy={loading || undefined}>
        <dl className="-mb-px -mr-px grid grid-cols-2 *:border-b *:border-r *:border-border @2xl:grid-cols-3 @5xl:grid-cols-6">
          {cellsFor(stats).map(({ Icon, label, value, detail }) => (
            <div key={label} className="flex min-w-0 flex-col px-4 py-4 md:px-5">
              <dt className={cn(COLUMN_LABEL_CLASS, "flex items-center gap-1.5")}>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </dt>
              <dd className="mt-1.5">
                {value !== null ? (
                  <span className="block truncate font-mono text-[22px] font-medium leading-tight tabular-nums text-foreground">{value}</span>
                ) : loading ? (
                  <span aria-hidden="true" className="block h-7 w-16 rounded-sm bg-[var(--ink-3)] motion-safe:animate-pulse" />
                ) : (
                  <span className="block font-mono text-[22px] font-medium leading-tight text-muted-foreground">—</span>
                )}
              </dd>
              <dd className="mt-1 min-h-4 truncate text-xs text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
      {error && !stats ? <InlineError>{`Couldn't load platform totals. ${error}`}</InlineError> : null}
    </SettingsSection>
  );
}
