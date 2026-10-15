"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cycleCheckInSummary } from "@/src/lib/grade-editor-summary";
import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import { MAX_PACKAGE_PER_CYCLE, type GradeRow, type TotalsRow } from "./grade-editor-types";
import { emailLocalPart, isMissedFinalCut, rowLabel } from "./grade-editor-utils";
import { OverExtensionsTag, RowSaveMark, RowStatusTag } from "./row-fields";

export function PhoneListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="flex min-h-16 flex-col justify-center gap-2 px-4 py-3">
          <Skeleton className={cn("h-3.5", index % 2 ? "w-1/2" : "w-2/3")} />
          <Skeleton className="h-3 w-3/4" />
        </li>
      ))}
    </ul>
  );
}

function finalLabel(row: GradeRow) {
  if (row.finalCutState === "EXEMPT") return "Exempt";
  if (row.effortPoints !== null) return `${row.effortPoints}/${MAX_PACKAGE_PER_CYCLE}`;
  if (isMissedFinalCut(row)) return `0/${MAX_PACKAGE_PER_CYCLE}`;
  return "—";
}

/** Phones and tablets: one tappable row per reporter; tapping opens the row sheet with every control. */
export function CycleGradesList({
  rows,
  dirtyUserIds,
  savingUserId,
  failedUserId,
  participationByUserId,
  loading,
  inert,
  empty,
  onOpenRow
}: {
  rows: GradeRow[];
  dirtyUserIds: ReadonlySet<string>;
  savingUserId: string | null;
  failedUserId: string | null;
  participationByUserId: ReadonlyMap<string, TotalsRow>;
  loading: boolean;
  inert: boolean;
  empty: ReactNode;
  onOpenRow: (userId: string) => void;
}) {
  if (loading && rows.length === 0) return <PhoneListSkeleton />;
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ul
      aria-label="Reporters"
      inert={inert}
      aria-busy={inert || undefined}
      className={cn("divide-y divide-border transition-opacity", inert && "opacity-60")}
    >
      {rows.map((row) => {
        const checkIns = cycleCheckInSummary(row.checkInScores);
        const participation = participationByUserId.get(row.userId);
        const dirty = dirtyUserIds.has(row.userId);
        return (
          <li key={row.userId}>
            <button
              type="button"
              onClick={() => onOpenRow(row.userId)}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                dirty && "bg-[var(--brand-amber)]/[0.07]"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{rowLabel(row)}</span>
                  <RowStatusTag row={row} />
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate font-mono-broadcast">{emailLocalPart(row.email)}</span>
                  <RowSaveMark saving={savingUserId === row.userId} dirty={dirty} failed={failedUserId === row.userId} />
                  <OverExtensionsTag row={row} />
                </span>
                <span className="mt-1 block truncate font-mono-broadcast text-xs tabular-nums text-[var(--ink-text)]">
                  Final {finalLabel(row)} · Check-ins{" "}
                  {checkIns.possible > 0 ? `${checkIns.earned}/${checkIns.possible}` : "—"}
                  {participation ? ` · Part. ${participation.participationEarned}/${participation.participationPossible}` : ""}
                </span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
