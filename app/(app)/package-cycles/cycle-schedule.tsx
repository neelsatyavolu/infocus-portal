import { CalendarClock, Check } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { EmptyState } from "@/components/kit/empty-state";
import { StatusTag } from "@/components/kit/status-tag";
import { relativeDaysLabel } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";
import {
  SECTION_LABEL,
  SECTION_TONE,
  STAGE_FIELDS,
  cycleMonth,
  daysFrom,
  formatDateFull,
  formatDateShort,
  nextStageKey,
  parseDateKey,
  type Deadline,
  type OrderedCycle,
  type StageField
} from "./cycle-dates-utils";
import {
  CARDS_ONLY,
  CLOSED_CYCLES_STORAGE_KEY,
  CURRENT_TINT,
  ClosedGroupRow,
  CurrentBar,
  CycleName,
  DATES_CONTAINER,
  ScheduleColumns,
  ScheduleHead,
  SemesterTag,
  TABLE_ONLY
} from "./cycle-parts";

type StageCell = {
  date: Date | null;
  days: number | null;
  /** This stage is its (open) cycle's next stage. */
  isNext: boolean;
  /** Due on the soonest date on the page (the one named in the header). */
  isSoonest: boolean;
};

type ScheduleProps = { ordered: OrderedCycle[]; today: Date; soonest: Deadline | null };

function stageCell(entry: OrderedCycle, stage: StageField, today: Date, soonest: Deadline | null): StageCell {
  const date = parseDateKey(entry.cycle[stage.key]);
  const days = date ? daysFrom(date, today) : null;
  const open = entry.section !== "closed";
  return {
    date,
    days,
    isNext: open && nextStageKey(entry.cycle, today) === stage.key,
    isSoonest: open && soonest !== null && days === soonest.days
  };
}

/** Line 1: the date in Geist Mono ("Thu, Oct 16"; the full date on hover), or TBD. */
function DateValue({ date, today, muted }: { date: Date | null; today: Date; muted: boolean }) {
  if (!date) {
    return (
      <span title="No date set" className="block font-mono-broadcast text-[13px] leading-5 text-muted-foreground">
        TBD
      </span>
    );
  }
  const full = formatDateFull(date);
  return (
    <span
      title={full}
      className={cn(
        "block font-mono-broadcast text-[13px] leading-5 tabular-nums",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      <span aria-hidden>{formatDateShort(date, today)}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

/**
 * Line 2: Completed, a countdown, or nothing (no date). A cycle's next stage is a tag ("Next ·
 * in 23d"); the page's soonest deadline is the one warning tag. Other dates stay plain text.
 * In a narrow table column (inside an `@container`) the tag keeps the countdown and drops the
 * "Next ·" prefix to screen-reader text (the tag itself marks the next stage; hover says so too).
 */
function StageStatus({ cell }: { cell: StageCell }) {
  if (!cell.date || cell.days === null) return null;
  if (cell.days < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0" />
        Completed
      </span>
    );
  }
  const countdown = relativeDaysLabel(cell.days);
  if (cell.isNext || cell.isSoonest) {
    return (
      <StatusTag
        tone={cell.isSoonest ? "warning" : "neutral"}
        srLabel={cell.isSoonest ? "Soonest deadline, " : undefined}
        title={`${cell.isNext ? "Next stage" : "Soonest deadline"} · ${countdown}`}
      >
        {cell.isNext ? (
          <>
            <span className="@max-[6.75rem]:sr-only">Next · </span>
            {countdown}
          </>
        ) : (
          countdown
        )}
      </StatusTag>
    );
  }
  return <span className="font-mono-broadcast text-xs leading-5 tabular-nums text-muted-foreground">{countdown}</span>;
}

function ScheduleRow({ entry, today, soonest }: { entry: OrderedCycle; today: Date; soonest: Deadline | null }) {
  const current = entry.section === "current";
  return (
    <tr className={cn("border-t border-border", current && CURRENT_TINT)}>
      <th scope="row" className="relative py-3 pl-4 pr-3 text-left align-top font-normal">
        {current ? <CurrentBar /> : null}
        <CycleName cycle={entry.cycle} section={entry.section} />
      </th>
      {STAGE_FIELDS.map((stage) => {
        const cell = stageCell(entry, stage, today, soonest);
        return (
          <td key={stage.key} className="px-2.5 py-3 align-top">
            <div className="@container">
              <DateValue date={cell.date} today={today} muted={entry.section === "closed"} />
              <span className="mt-1 flex min-h-5 items-center">
                <StageStatus cell={cell} />
              </span>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

/** From 45rem: one row per cycle, one equal column per stage, so dates line up across cycles. */
function ScheduleTable({ ordered, today, soonest }: ScheduleProps) {
  const open = ordered.filter((entry) => entry.section !== "closed");
  const closed = ordered.filter((entry) => entry.section === "closed");
  return (
    <div className={TABLE_ONLY}>
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">Stage dates by cycle</caption>
        <ScheduleColumns />
        <ScheduleHead />
        {open.length > 0 ? (
          <tbody>
            {open.map((entry) => (
              <ScheduleRow key={entry.cycle.cycleNumber} entry={entry} today={today} soonest={soonest} />
            ))}
          </tbody>
        ) : null}
        {closed.length > 0 ? (
          <tbody>
            <ClosedGroupRow count={closed.length} colSpan={STAGE_FIELDS.length + 1} />
            {closed.map((entry) => (
              <ScheduleRow key={entry.cycle.cycleNumber} entry={entry} today={today} soonest={soonest} />
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  );
}

/** Below 45rem: one block per cycle, stage name on the left, date and status on the right. */
function CycleCard({ entry, today, soonest }: { entry: OrderedCycle; today: Date; soonest: Deadline | null }) {
  const { cycle, section } = entry;
  const current = section === "current";
  const month = cycleMonth(cycle);
  const titleId = `cycle-${cycle.cycleNumber}-title`;
  return (
    <li>
      <article aria-labelledby={titleId} className={cn("relative px-4 py-4", current && CURRENT_TINT)}>
        {current ? <CurrentBar /> : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-h-6 items-center gap-2">
              <h3 id={titleId} className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
                Cycle {cycle.cycleNumber}
              </h3>
              <SemesterTag cycleNumber={cycle.cycleNumber} />
            </div>
            {month ? <p className="text-xs text-muted-foreground">{month}</p> : null}
          </div>
          <StatusTag tone={SECTION_TONE[section]} className="mt-0.5">
            {SECTION_LABEL[section]}
          </StatusTag>
        </div>
        <dl className="mt-3 divide-y divide-border border-t border-border">
          {STAGE_FIELDS.map((stage) => {
            const cell = stageCell(entry, stage, today, soonest);
            return (
              <div key={stage.key} className="flex items-start justify-between gap-4 py-2">
                <dt className="min-w-0 text-sm leading-5 text-foreground">{stage.label}</dt>
                <dd className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <DateValue date={cell.date} today={today} muted={section === "closed"} />
                  <StageStatus cell={cell} />
                </dd>
              </div>
            );
          })}
        </dl>
      </article>
    </li>
  );
}

function ScheduleList({ ordered, today, soonest }: ScheduleProps) {
  const open = ordered.filter((entry) => entry.section !== "closed");
  const closed = ordered.filter((entry) => entry.section === "closed");
  return (
    <div className={CARDS_ONLY}>
      {open.length > 0 ? (
        <ul className="divide-y divide-border">
          {open.map((entry) => (
            <CycleCard key={entry.cycle.cycleNumber} entry={entry} today={today} soonest={soonest} />
          ))}
        </ul>
      ) : null}
      {closed.length > 0 ? (
        <Disclosure
          summary="Closed cycles"
          count={closed.length}
          storageKey={CLOSED_CYCLES_STORAGE_KEY}
          className={cn("px-4", open.length > 0 && "border-t border-border")}
          bodyClassName="-mx-4 border-t border-border pt-0"
        >
          <ul className="divide-y divide-border">
            {closed.map((entry) => (
              <CycleCard key={entry.cycle.cycleNumber} entry={entry} today={today} soonest={soonest} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}

/**
 * The read-only schedule in one bordered card: a table from 45rem, cycle blocks below it (the
 * editor's wider switch point is explained at DATES_CONTAINER).
 */
export function CycleSchedule({ ordered, today, soonest }: ScheduleProps) {
  return (
    <div className={DATES_CONTAINER}>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {ordered.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No cycles yet" description="Cycle dates show here once the semester has cycles." />
        ) : (
          <>
            <ScheduleTable ordered={ordered} today={today} soonest={soonest} />
            <ScheduleList ordered={ordered} today={today} soonest={soonest} />
          </>
        )}
      </div>
    </div>
  );
}
