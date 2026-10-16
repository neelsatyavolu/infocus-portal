"use client";

import type { ReactNode } from "react";
import { cycleCheckInSummary } from "@/src/lib/grade-editor-summary";
import { CHECK_IN_STAGES, type CheckInStage } from "@/src/lib/package-stages";
import { Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import {
  CHECK_IN_LABELS,
  CHECK_IN_SHORT_LABELS,
  FINAL_CUT_REQUIRED_HINT,
  MAX_CHECK_INS_PER_CYCLE,
  MAX_PACKAGE_PER_CYCLE,
  PARTICIPATION_HINT,
  type GradeRow,
  type TotalsRow
} from "./grade-editor-types";
import { rowLabel } from "./grade-editor-utils";
import {
  CELL,
  columnCount,
  GROUP_START,
  GradeTableHead,
  NUM_CELL,
  PointsReadout,
  REPORTER_INSET,
  ReporterCell,
  TABLE_CLASS,
  TableEmpty,
  tableMinWidth,
  TIGHT_INSET,
  type HeaderGroup
} from "./grade-editor-table";
import {
  CheckInField,
  FeedbackButton,
  HistoryButton,
  LockedColumnIcon,
  OverExtensionsTag,
  PublishButton,
  RowSaveMark,
  RowStatusTag,
  ScoreField,
  ScorePercent,
  TurnedInField
} from "./row-fields";

/** Check-in dropdowns: a 64px box (4px insets), wide enough for "5 · auto", "Ungraded" and "Exempt". */
const CHECK_IN_WIDTH = 72;
/** Feedback (32) + Publish (84) + History (32), 4px gaps, px-2 either side. */
const ACTIONS_WIDTH = 172;
/**
 * From lg, Status and Actions are pinned to the right edge (opaque, with the group's hairline on
 * their left), so per-row Publish stays in reach while the middle columns scroll on a laptop.
 * The offsets must match ACTIONS_WIDTH.
 */
const PIN_STATUS = "lg:sticky lg:right-[172px] lg:z-10";
const PIN_ACTIONS = "lg:sticky lg:right-0 lg:z-10";
const PIN_STATUS_HEAD = "lg:right-[172px] lg:z-30";
const PIN_ACTIONS_HEAD = "lg:right-0 lg:z-30";

/**
 * Column budget: 1,148px, which fits the work panel at 1440 with the full sidebar (and at 1280
 * once the shell collapses this route to the rail). The Final Cut columns sit right after the
 * reporter and Status / Actions are pinned right, so on a narrower window only the check-ins and
 * participation (mostly automatic) scroll sideways.
 */
function cycleGroups(locked: boolean): HeaderGroup[] {
  return [
    { label: "", columns: [{ label: "Reporter" }] },
    {
      label: "Final cut",
      columns: [
        {
          label: "Score",
          sub: `/${MAX_PACKAGE_PER_CYCLE}`,
          title: `Final Cut score out of ${MAX_PACKAGE_PER_CYCLE} and its percentage after any late penalty`,
          width: 132
        },
        {
          label: "Turned in",
          width: 116,
          title: locked ? FINAL_CUT_REQUIRED_HINT : undefined,
          icon: locked ? <LockedColumnIcon /> : undefined
        }
      ]
    },
    {
      label: "Check-ins",
      hint: "5 pts each",
      columns: [
        ...CHECK_IN_STAGES.map((stage) => ({
          label: CHECK_IN_SHORT_LABELS[stage],
          title: CHECK_IN_LABELS[stage],
          width: CHECK_IN_WIDTH,
          className: TIGHT_INSET
        })),
        {
          label: "Total",
          title: `Released check-ins this cycle, out of ${MAX_CHECK_INS_PER_CYCLE}`,
          width: 72,
          align: "right" as const
        }
      ]
    },
    {
      label: "Semester",
      columns: [{ label: "Participation", title: "Graded days in weeks that have ended", width: 108, align: "right" as const }]
    },
    {
      label: "Publishing",
      className: PIN_ACTIONS_HEAD,
      columns: [
        { label: "Status", width: 112, className: PIN_STATUS_HEAD },
        { label: "Actions", title: "Feedback, publish and publish history", width: ACTIONS_WIDTH, className: PIN_ACTIONS_HEAD }
      ]
    }
  ];
}

export type CycleRowHandlers = {
  onOpenStudent: (userId: string) => void;
  onUpdateRow: (userId: string, patch: Partial<GradeRow>) => void;
  onSaveCheckIn: (userId: string, stage: CheckInStage, value: string) => void;
  onTogglePublish: (userId: string) => void;
  onOpenFeedback: (userId: string) => void;
  onOpenHistory: (userId: string) => void;
};

export type CycleRowState = {
  dirtyUserIds: ReadonlySet<string>;
  savingUserId: string | null;
  failedUserId: string | null;
  publishingUserId: string | null;
  savingAll: boolean;
  publishingAll: boolean;
  savingCheckIn: boolean;
  locked: boolean;
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
              <Skeleton className={cn("h-3.5", cell % 3 === 0 ? "w-3/4" : "w-1/2")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** The cycle grading table (lg and up): one 48px line per reporter, pinned header and names. */
export function CycleGradesTable({
  rows,
  state,
  handlers,
  participationByUserId,
  loading,
  inert,
  empty
}: {
  /** Visible rows, already filtered and sorted. */
  rows: GradeRow[];
  state: CycleRowState;
  handlers: CycleRowHandlers;
  participationByUserId: ReadonlyMap<string, TotalsRow>;
  /** First load: skeleton rows. */
  loading: boolean;
  /** A silent reload is running: old rows stay visible but can't be edited. */
  inert: boolean;
  /** Shown under the header rows when there are no visible rows. */
  empty: ReactNode;
}) {
  const groups = cycleGroups(state.locked);
  const showEmpty = !loading && rows.length === 0;
  return (
    <>
      <table className={TABLE_CLASS} style={{ minWidth: tableMinWidth(groups) }}>
        <caption className="sr-only">Final Cut grades for this cycle</caption>
        <GradeTableHead groups={groups} />
        <tbody inert={inert} aria-busy={inert || loading || undefined} className={cn("transition-opacity", inert && "opacity-60")}>
          {loading && rows.length === 0 ? (
            <SkeletonRows columns={columnCount(groups)} />
          ) : (
            rows.map((row) => (
              <CycleGradeRow
                key={row.userId}
                row={row}
                state={state}
                handlers={handlers}
                participation={participationByUserId.get(row.userId) ?? null}
              />
            ))
          )}
        </tbody>
      </table>
      {showEmpty ? <TableEmpty>{empty}</TableEmpty> : null}
    </>
  );
}

function CycleGradeRow({
  row,
  state,
  handlers,
  participation
}: {
  row: GradeRow;
  state: CycleRowState;
  handlers: CycleRowHandlers;
  participation: TotalsRow | null;
}) {
  const dirty = state.dirtyUserIds.has(row.userId);
  const checkIns = cycleCheckInSummary(row.checkInScores);
  const checkInsCounted = checkIns.possible > 0;
  const name = rowLabel(row);

  return (
    <tr data-dirty={dirty || undefined}>
      <ReporterCell name={name} email={row.email} onOpen={() => handlers.onOpenStudent(row.userId)}>
        <RowSaveMark saving={state.savingUserId === row.userId} dirty={dirty} failed={state.failedUserId === row.userId} />
        <OverExtensionsTag row={row} />
      </ReporterCell>
      <td className={cn(CELL, GROUP_START)}>
        <span className="inline-flex items-center gap-1">
          <ScoreField row={row} navKey="cycle-final" onChange={(patch) => handlers.onUpdateRow(row.userId, patch)} />
          <ScorePercent row={row} />
        </span>
      </td>
      <td className={CELL}>
        <TurnedInField
          row={row}
          locked={state.locked}
          onChange={(turnedInDate) => handlers.onUpdateRow(row.userId, { turnedInDate })}
        />
      </td>
      {CHECK_IN_STAGES.map((stage, stageIdx) => (
        <td key={stage} className={cn(CELL, TIGHT_INSET, stageIdx === 0 && GROUP_START)}>
          <CheckInField
            row={row}
            stage={stage}
            disabled={state.savingCheckIn}
            onChange={(value) => handlers.onSaveCheckIn(row.userId, stage, value)}
          />
        </td>
      ))}
      <td className={NUM_CELL}>
        <PointsReadout
          stacked
          earned={checkInsCounted ? checkIns.earned : null}
          possible={checkInsCounted ? checkIns.possible : null}
          title={
            checkIns.released === 0
              ? "No check-in is due yet"
              : !checkInsCounted
                ? "Every due check-in is ungraded or exempt"
                : `${checkIns.released} of ${CHECK_IN_STAGES.length} check-ins due so far`
          }
        />
      </td>
      <td className={cn(NUM_CELL, GROUP_START)}>
        {participation ? (
          <PointsReadout
            stacked
            earned={participation.participationEarned}
            possible={participation.participationPossible}
            title={PARTICIPATION_HINT}
          />
        ) : (
          <span className="font-mono-broadcast text-[13px] text-muted-foreground">—</span>
        )}
      </td>
      <td className={cn(CELL, GROUP_START, PIN_STATUS)}>
        <RowStatusTag row={row} />
      </td>
      <td className={cn(CELL, PIN_ACTIONS)}>
        <span className="flex items-center gap-1">
          <FeedbackButton row={row} onClick={() => handlers.onOpenFeedback(row.userId)} />
          <PublishButton
            row={row}
            publishing={state.publishingUserId === row.userId}
            disabled={state.savingAll || state.publishingAll || state.savingUserId === row.userId}
            onClick={() => handlers.onTogglePublish(row.userId)}
          />
          <HistoryButton row={row} onClick={() => handlers.onOpenHistory(row.userId)} />
        </span>
      </td>
    </tr>
  );
}
