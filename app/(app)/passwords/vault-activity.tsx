"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/kit/disclosure";
import { useRememberedState } from "@/components/kit/remembered-state";
import { Skeleton } from "@/components/kit/skeleton";
import { VAULT_ACTION_LABELS, type VaultActivityRow } from "@/src/lib/password-vault";
import { cn } from "@/src/lib/utils";
import { vaultRequest } from "./vault-api";
import { VAULT_LABEL_CLASS } from "./vault-field-row";

/** Only fetch once a login has stayed selected this long, so ↑/↓ through the list doesn't fire a request per row. */
const FETCH_DELAY_MS = 400;

/** The rail shows this many entries until "Show all", so it stays about as tall as the fields beside it. */
const RAIL_LIMIT = 8;

type ActivityState = { status: "loading" } | { status: "ready"; rows: VaultActivityRow[] } | { status: "error" };

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** GET /api/vault/:id/activity (full access only), debounced, ignoring stale answers. */
function useVaultActivity(entryId: string, enabled: boolean, refreshKey: string) {
  const [state, setState] = useState<ActivityState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      vaultRequest<VaultActivityRow[]>(`/api/vault/${entryId}/activity`)
        .then((rows) => !cancelled && setState({ status: "ready", rows }))
        .catch(() => !cancelled && setState({ status: "error" }));
    }, FETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [entryId, enabled, refreshKey]);

  return state;
}

type ActivityLayout = "rail" | "disclosure";

/**
 * One line per entry in the disclosure (actor · action, then the time). The rail is only 16rem
 * wide, so each entry takes two lines there: the words wrap and the time sits under them, and
 * only the latest RAIL_LIMIT show until "Show all N". The full entry is always in the hover title.
 */
function ActivityRows({ state, layout }: { state: ActivityState; layout: ActivityLayout }) {
  const rail = layout === "rail";
  const [showAll, setShowAll] = useState(false);
  if (state.status === "loading") {
    return (
      <div aria-hidden className="space-y-3 py-1">
        {[0, 1, 2].map((index) => (
          <div key={index} className={rail ? "space-y-1.5" : "flex items-center justify-between gap-3"}>
            <Skeleton className={cn("h-3.5", index === 1 ? "w-1/2" : "w-2/3")} />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return <p className="py-1 text-[13px] text-muted-foreground">Couldn&apos;t load activity.</p>;
  }
  if (!state.rows.length) {
    return <p className="py-1 text-[13px] text-muted-foreground">No activity yet.</p>;
  }
  const capped = rail && state.rows.length > RAIL_LIMIT;
  const rows = capped && !showAll ? state.rows.slice(0, RAIL_LIMIT) : state.rows;
  const list = (
    <ul className={cn("text-[13px]", rail ? "space-y-3" : "space-y-2")}>
      {rows.map((row) => {
        const label = VAULT_ACTION_LABELS[row.action] ?? row.action;
        const when = formatWhen(row.createdAt);
        return (
          <li
            key={row.id}
            title={`${row.actor} · ${label} · ${when}`}
            className={rail ? "min-w-0" : "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3"}
          >
            <span className={cn("min-w-0 text-muted-foreground", rail ? "block [overflow-wrap:anywhere]" : "truncate")}>
              <span className="text-foreground">{row.actor}</span> · {label}
            </span>
            <span
              className={cn(
                "whitespace-nowrap font-mono-broadcast text-xs tabular-nums text-muted-foreground",
                rail && "mt-0.5 block"
              )}
            >
              {when}
            </span>
          </li>
        );
      })}
    </ul>
  );
  if (!capped) return list;
  return (
    <div className="space-y-3">
      {list}
      <button
        type="button"
        onClick={() => setShowAll((value) => !value)}
        aria-expanded={showAll}
        className="rounded-sm text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {showAll ? "Show fewer" : `Show all ${state.rows.length}`}
      </button>
    </div>
  );
}

/**
 * Recent activity for one login (who added, edited, viewed or shared it). `rail` is always open
 * beside the fields when the detail is wide; `disclosure` folds away and remembers its state.
 * Render it only for full access: shared viewers can't read the log.
 */
export function VaultActivity({
  entryId,
  layout,
  refreshKey
}: {
  entryId: string;
  layout: ActivityLayout;
  /** Changes after every list reload (a save, share or import), so the log is fetched again. */
  refreshKey: string;
}) {
  const [open, setOpen] = useRememberedState<boolean>("passwords:activity-open:v1", false, isBoolean);
  const active = layout === "rail" || open;
  const state = useVaultActivity(entryId, active, refreshKey);

  if (layout === "rail") {
    return (
      <section aria-labelledby={`activity-${entryId}`} className="min-w-0 space-y-3">
        <h3 id={`activity-${entryId}`} className={cn(VAULT_LABEL_CLASS, "flex min-h-6 items-center")}>
          Recent activity
        </h3>
        <ActivityRows state={state} layout="rail" />
      </section>
    );
  }

  return (
    <Disclosure summary="Recent activity" open={open} onOpenChange={setOpen} bodyClassName="pb-1">
      <ActivityRows state={state} layout="disclosure" />
    </Disclosure>
  );
}
