"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { type AnchorPaCountRow } from "@/src/lib/anchor-pa-counts";
import { cn } from "@/src/lib/utils";

type CastCountsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type RosterFilter = "all" | "no-anchors" | "no-pa";

const COLUMN_COUNT = 3;

function splitColumns<T>(items: T[], columnCount: number): T[][] {
  if (items.length === 0) {
    return Array.from({ length: columnCount }, () => []);
  }
  const size = Math.ceil(items.length / columnCount);
  return Array.from({ length: columnCount }, (_, index) =>
    items.slice(index * size, index * size + size)
  );
}

function CountCell({ value }: { value: number }) {
  return (
    <td className="w-10 py-1 text-right font-mono text-[13px] tabular-nums">
      <span
        className={cn(
          "inline-block min-w-[1.25rem]",
          value === 0 ? "text-muted-foreground/55" : "font-medium text-foreground"
        )}
      >
        {value === 0 ? "—" : value}
      </span>
    </td>
  );
}

export function CastCountsDialog({ open, onOpenChange }: CastCountsDialogProps) {
  const [people, setPeople] = useState<AnchorPaCountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterFilter>("all");

  useEffect(() => {
    if (!open) {
      setFilter("all");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetch("/api/master-calendar/cast-counts", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { people: AnchorPaCountRow[] };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Failed to load counts.");
        }
        if (!active) return;
        setPeople(payload.data.people);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load counts.");
        setPeople([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const noAnchorsCount = people.filter((row) => row.anchors === 0).length;
  const noPaCount = people.filter((row) => row.pa === 0).length;

  const visible = useMemo(() => {
    const rows =
      filter === "no-anchors"
        ? people.filter((row) => row.anchors === 0)
        : filter === "no-pa"
          ? people.filter((row) => row.pa === 0)
          : people;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [people, filter]);

  const columns = splitColumns(visible, COLUMN_COUNT);

  const emptyCopy =
    filter === "no-anchors"
      ? "Everyone has an anchor assignment."
      : filter === "no-pa"
        ? "Everyone has a PA assignment."
        : "No roster or assignments yet.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl gap-5 overflow-y-auto sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-balance">Anchors & PA</DialogTitle>
          <DialogDescription className="text-pretty">
            Assignments on the master calendar, including upcoming days. Dash means none yet.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <SummaryTile
            value={loading ? "—" : people.length}
            label="On roster"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <SummaryTile
            value={loading ? "—" : noAnchorsCount}
            label="No anchors"
            active={filter === "no-anchors"}
            onClick={() => setFilter("no-anchors")}
          />
          <SummaryTile
            value={loading ? "—" : noPaCount}
            label="No PA"
            active={filter === "no-pa"}
            onClick={() => setFilter("no-pa")}
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-x-5">
            {Array.from({ length: 3 }).map((_, column) => (
              <div key={column} className="space-y-2">
                {Array.from({ length: 8 }).map((__, row) => (
                  <div key={row} className="h-6 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyCopy}</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            {columns.map((column, columnIndex) =>
              column.length === 0 ? (
                <div key={columnIndex} />
              ) : (
                <table key={columnIndex} className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="pb-2 text-left font-semibold">Name</th>
                      <th className="w-10 pb-2 text-right font-semibold">A</th>
                      <th className="w-10 pb-2 text-right font-semibold">PA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {column.map((row) => {
                      const noneYet = row.anchors === 0 && row.pa === 0;
                      return (
                        <tr key={row.name} className="border-t border-border/50">
                          <td className="py-1 pr-2">
                            <span
                              className={cn(
                                "block truncate font-medium",
                                noneYet ? "text-muted-foreground" : "text-foreground"
                              )}
                            >
                              {row.name}
                            </span>
                          </td>
                          <CountCell value={row.anchors} />
                          <CountCell value={row.pa} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  value,
  label,
  active,
  onClick
}: {
  value: number | string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl px-3 py-2.5 text-left transition-colors",
        active
          ? "bg-[var(--brand-green)]/15 ring-1 ring-[var(--brand-green)]/40"
          : "bg-secondary/70 ring-1 ring-transparent hover:bg-secondary"
      )}
    >
      <p className="font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
    </button>
  );
}
