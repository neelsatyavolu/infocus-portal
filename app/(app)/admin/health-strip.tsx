import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/kit/skeleton";
import { SettingsSection } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS, HealthTag } from "./admin-ui";
import type { Health } from "./admin-status";

export type HealthItem = { key: string; label: string; health: Health; target: string };

const CELL_CLASS =
  "group min-w-0 bg-card px-3 py-3 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4 sm:py-3.5 md:px-5";

function Detail({ health }: { health: Health }) {
  if (health.code === "checking") return <Skeleton className="h-3.5 w-32 max-w-full" />;
  return (
    <span title={health.detail ?? undefined} className="block min-w-0 truncate text-[13px] text-muted-foreground">
      {health.detail ?? " "}
    </span>
  );
}

/**
 * Admin → Overview: is anything broken? One cell per integration, backups and Paly's calendar
 * check. A cell opens the section where it is fixed. Phones get a compact 2×2 (label and tag;
 * the tag carries the state), so the access-request queue stays near the top. Executive
 * producers see only Paly's calendar, drawn as one full-width row.
 */
export function HealthStrip({ items, onSelect }: { items: HealthItem[]; onSelect: (target: string) => void }) {
  if (items.length === 0) return null;
  const single = items.length === 1;
  return (
    <SettingsSection id="admin-health" title="Status">
      <div
        className={cn(
          "grid gap-px overflow-hidden rounded-md border border-border bg-border",
          !single && "grid-cols-2 @5xl:grid-cols-4"
        )}
      >
        {items.map((item) =>
          single ? (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.target)}
              className={cn(CELL_CLASS, "flex flex-wrap items-center gap-x-3 gap-y-1")}
            >
              <span className={COLUMN_LABEL_CLASS}>{item.label}</span>
              <HealthTag health={item.health} />
              <span className="min-w-0 flex-1">
                <Detail health={item.health} />
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </button>
          ) : (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.target)}
              className={cn(CELL_CLASS, "flex flex-col gap-2")}
            >
              <span className="flex min-h-4 min-w-0 items-center justify-between gap-2">
                <span className={cn(COLUMN_LABEL_CLASS, "min-w-0 truncate")}>{item.label}</span>
                <ChevronRight
                  className="hidden h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground sm:block"
                  aria-hidden="true"
                />
              </span>
              <span className="flex">
                <HealthTag health={item.health} />
              </span>
              <span className="hidden min-w-0 sm:block">
                <Detail health={item.health} />
              </span>
            </button>
          )
        )}
      </div>
    </SettingsSection>
  );
}
