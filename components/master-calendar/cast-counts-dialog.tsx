"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/kit/alert";
import { Skeleton } from "@/components/kit/skeleton";
import { StatTile } from "@/components/kit/stat-tile";
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
const HEAD_CLASS = "h-8 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

function splitColumns<T>(items: T[], columnCount: number): T[][] {
  if (items.length === 0) return Array.from({ length: columnCount }, () => []);
  const size = Math.ceil(items.length / columnCount);
  return Array.from({ length: columnCount }, (_, index) => items.slice(index * size, index * size + size));
}

function CountCell({ value }: { value: number }) {
  return (
    <td
      className={cn(
        "w-10 text-right font-mono-broadcast text-[13px] tabular-nums",
        value === 0 ? "text-muted-foreground" : "font-medium text-foreground"
      )}
    >
      {value === 0 ? "—" : value}
    </td>
  );
}

function RosterTable({ rows }: { rows: AnchorPaCountRow[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD_CLASS, "text-left")}>
            Name
          </th>
          <th scope="col" className={cn(HEAD_CLASS, "w-10 text-right")} title="Anchor assignments">
            <span aria-hidden>A</span>
            <span className="sr-only">Anchor assignments</span>
          </th>
          <th scope="col" className={cn(HEAD_CLASS, "w-10 text-right")} title="PA assignments">
            <span aria-hidden>PA</span>
            <span className="sr-only">PA assignments</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const noneYet = row.anchors === 0 && row.pa === 0;
          return (
            <tr key={row.name} className="h-8 border-t border-border">
              <td className="pr-2">
                <span className={cn("block truncate", noneYet ? "text-muted-foreground" : "font-medium text-foreground")}>
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
  );
}

/** Executives only: how many anchor and PA assignments each person has, including upcoming days. */
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
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to load counts.");
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
  const unknown = loading || Boolean(error);

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

  const tiles: Array<{ value: RosterFilter; label: string; count: number }> = [
    { value: "all", label: "On roster", count: people.length },
    { value: "no-anchors", label: "No anchors", count: noAnchorsCount },
    { value: "no-pa", label: "No PA", count: noPaCount }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-3xl gap-5 overflow-y-auto sm:rounded-md">
        <DialogHeader>
          <DialogTitle className="text-balance">Anchors & PA</DialogTitle>
          <DialogDescription className="text-pretty">
            Assignments on the master calendar, including upcoming days. Dash means none yet.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}

        <div role="group" aria-label="Filter roster" className="grid grid-cols-3 gap-2 *:h-full">
          {tiles.map((tile) => (
            <StatTile
              key={tile.value}
              label={tile.label}
              value={unknown ? "—" : tile.count}
              pressed={filter === tile.value}
              onClick={() => setFilter(tile.value)}
              className="p-3"
            />
          ))}
        </div>

        {loading ? (
          <div aria-hidden className="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
            {Array.from({ length: COLUMN_COUNT }).map((_, column) => (
              <div key={column} className={cn("space-y-2", column > 0 && "max-sm:hidden")}>
                {Array.from({ length: 8 }).map((__, row) => (
                  <Skeleton key={row} className="h-6" />
                ))}
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyCopy}</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
            {columns.map((column, columnIndex) =>
              column.length === 0 ? (
                <div key={columnIndex} />
              ) : (
                <div key={columnIndex} className={cn(columnIndex > 0 && "max-sm:[&_thead]:hidden")}>
                  <RosterTable rows={column} />
                </div>
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
