"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { emailLocalPart, letterGrade, personLabel } from "./grade-editor-utils";
import { LetterGradeTag, PercentReadout } from "./grade-editor-table";
import { PhoneListSkeleton } from "./cycle-grades-list";
import type { TotalsRowView } from "./totals-grades-table";

/** Phones and tablets: name, letter and points per reporter; tapping opens the totals sheet. */
export function TotalsGradesList({
  views,
  loading,
  empty,
  onOpenRow
}: {
  views: TotalsRowView[];
  loading: boolean;
  empty: ReactNode;
  onOpenRow: (userId: string) => void;
}) {
  if (loading && views.length === 0) return <PhoneListSkeleton />;
  if (views.length === 0) return <>{empty}</>;
  return (
    <ul aria-label="Reporters" className="divide-y divide-border">
      {views.map(({ row, summary, edited }) => (
        <li key={row.userId}>
          <button
            type="button"
            onClick={() => onOpenRow(row.userId)}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <LetterGradeTag percent={summary.totalPct} letter={summary.totalPct === null ? null : letterGrade(summary.totalPct)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{personLabel(row)}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate font-mono-broadcast">{emailLocalPart(row.email)}</span>
                {edited ? (
                  <StatusTag tone="warning" size="sm" title="Temporary: changes this page and the CSV only">
                    Edited
                  </StatusTag>
                ) : null}
              </span>
            </span>
            <PercentReadout percent={summary.totalPct} />
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}
