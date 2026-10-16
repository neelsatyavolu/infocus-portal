"use client";

import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import type { TotalsAdjustments } from "@/src/lib/grade-editor-csv";
import { IconButton } from "@/components/kit/icon-button";
import { StatusTag } from "@/components/kit/status-tag";
import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import {
  MAX_FINAL,
  MAX_LIVESTREAM,
  MAX_PACKAGE_PER_CYCLE,
  PARTICIPATION_HINT,
  type CycleTab,
  type TotalsRow
} from "./grade-editor-types";
import { letterGrade, personLabel, type TotalsSummary } from "./grade-editor-utils";
import {
  CELL,
  columnCount,
  GROUP_START,
  GradeTableHead,
  LetterGradeTag,
  NUM_CELL,
  PercentReadout,
  PointsReadout,
  REPORTER_INSET,
  ReporterCell,
  SECOND_PINNED,
  SECOND_PINNED_HEAD,
  TABLE_CLASS,
  TableEmpty,
  tableMinWidth,
  type HeaderGroup
} from "./grade-editor-table";
import { CheckInsTotalField, CycleTotalField, ExtraField, FinalField, LivestreamField } from "./totals-fields";

function totalsGroups(cycles: CycleTab[]): HeaderGroup[] {
  return [
    { label: "", columns: [{ label: "Reporter" }] },
    {
      label: "Total grade",
      className: SECOND_PINNED_HEAD,
      columns: [{ label: "Grade", width: 160, className: SECOND_PINNED_HEAD }]
    },
    {
      label: "Packages",
      hint: `/${MAX_PACKAGE_PER_CYCLE} each`,
      columns: [
        ...cycles.map((cycle) => ({ label: `Cycle ${cycle.cycleNumber}`, width: 64, align: "right" as const })),
        { label: "Subtotal", width: 80, align: "right" as const }
      ]
    },
    {
      label: "Semester credits",
      columns: [
        { label: "Check-ins", width: 96, align: "right" as const },
        { label: "Livestream", sub: `/${MAX_LIVESTREAM}`, width: 120, align: "right" as const },
        { label: "Participation", title: "Graded days in weeks that have ended", width: 108, align: "right" as const },
        { label: "Final", sub: `/${MAX_FINAL}`, width: 80, align: "right" as const },
        { label: "Extra", title: "Earned / possible", width: 112, align: "right" as const }
      ]
    },
    { label: "", columns: [{ label: "Notes", width: 56, align: "center" as const }] }
  ];
}

export type TotalsRowHandlers = {
  onOpenStudent: (userId: string) => void;
  onUpdateAdjustment: (userId: string, patch: Partial<TotalsAdjustments>) => void;
  onOpenNotes: (userId: string) => void;
};

export type TotalsRowView = {
  row: TotalsRow;
  adjustments: TotalsAdjustments;
  summary: TotalsSummary;
  /** Temporary edits differ from what was loaded. */
  edited: boolean;
};

function SkeletonRows({ columns, count = 8 }: { columns: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, row) => (
        <tr key={row} aria-hidden>
          <td className={cn("h-12", REPORTER_INSET)}>
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-1.5 h-2.5 w-16" />
          </td>
          {Array.from({ length: columns - 1 }, (_, cell) => (
            <td key={cell} className={CELL}>
              <Skeleton className={cn("ml-auto h-3.5", cell % 2 ? "w-1/2" : "w-3/4")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** The Total grade table (lg and up). Total grade sits second, so it's visible without scrolling. */
export function TotalsGradesTable({
  views,
  cycles,
  handlers,
  loading,
  empty
}: {
  views: TotalsRowView[];
  cycles: CycleTab[];
  handlers: TotalsRowHandlers;
  loading: boolean;
  empty: ReactNode;
}) {
  const groups = totalsGroups(cycles);
  const showEmpty = !loading && views.length === 0;
  return (
    <>
      <table className={TABLE_CLASS} style={{ minWidth: tableMinWidth(groups) }}>
        <caption className="sr-only">Total grades</caption>
        <GradeTableHead groups={groups} />
        <tbody aria-busy={loading || undefined}>
          {loading && views.length === 0 ? (
            <SkeletonRows columns={columnCount(groups)} />
          ) : (
            views.map((view) => <TotalsGradeRow key={view.row.userId} view={view} handlers={handlers} />)
          )}
        </tbody>
      </table>
      {showEmpty ? <TableEmpty>{empty}</TableEmpty> : null}
    </>
  );
}

function TotalsGradeRow({ view, handlers }: { view: TotalsRowView; handlers: TotalsRowHandlers }) {
  const { row, adjustments, summary, edited } = view;
  const update = (patch: Partial<TotalsAdjustments>) => handlers.onUpdateAdjustment(row.userId, patch);
  const hasNotes = Boolean(row.notes.trim());

  return (
    <tr>
      <ReporterCell name={personLabel(row)} email={row.email} onOpen={() => handlers.onOpenStudent(row.userId)}>
        {edited ? (
          <StatusTag tone="warning" size="sm" title="Temporary: changes this page and the CSV only">
            Edited
          </StatusTag>
        ) : null}
      </ReporterCell>
      <td className={cn(CELL, GROUP_START, SECOND_PINNED)}>
        <span className="flex items-center gap-2">
          <LetterGradeTag percent={summary.totalPct} letter={summary.totalPct === null ? null : letterGrade(summary.totalPct)} />
          <PercentReadout percent={summary.totalPct} />
        </span>
      </td>
      {row.cycleTotals.map((entry, entryIdx) => (
        <td key={entry.cycleNumber} className={cn(CELL, entryIdx === 0 && GROUP_START)}>
          <span className="flex justify-end">
            <CycleTotalField row={row} entry={entry} adjustments={adjustments} update={update} />
          </span>
        </td>
      ))}
      <td className={NUM_CELL}>
        <PointsReadout
          stacked
          earned={summary.packages.possible > 0 ? summary.packages.earned : null}
          possible={summary.packages.possible > 0 ? summary.packages.possible : null}
        />
      </td>
      <td className={cn(NUM_CELL, GROUP_START)}>
        <CheckInsTotalField row={row} adjustments={adjustments} checkInMax={summary.checkInMax} update={update} />
      </td>
      <td className={NUM_CELL}>
        <LivestreamField row={row} adjustments={adjustments} update={update} />
      </td>
      <td className={NUM_CELL}>
        <PointsReadout stacked earned={row.participationEarned} possible={row.participationPossible} title={PARTICIPATION_HINT} />
      </td>
      <td className={NUM_CELL}>
        <FinalField row={row} adjustments={adjustments} update={update} />
      </td>
      <td className={NUM_CELL}>
        <ExtraField row={row} adjustments={adjustments} update={update} />
      </td>
      <td className={cn(CELL, GROUP_START, "text-center")}>
        <IconButton
          label={`${hasNotes ? "View" : "Add"} notes for ${row.name ?? "student"}`}
          icon={MessageSquare}
          size="sm"
          variant="outline"
          active={hasNotes}
          onClick={() => handlers.onOpenNotes(row.userId)}
        />
      </td>
    </tr>
  );
}
