import type { CSSProperties, ReactNode } from "react";
import { dueTone, relativeDaysLabel } from "@/components/kit/tone";
import {
  formatBoardDay,
  formatGateDate,
  type ClassBoardDay,
  type ClassBoardDeadline,
  type ClassBoardLivestream
} from "@/src/lib/class-board";
import { cn } from "@/src/lib/utils";
import { CAPACITY_TONE, CREW_OPEN, dayKindTag, splitRoleLine } from "./board-format";
import { BOARD_TEXT } from "./board-scale";
import { BoardRowCount } from "./board-row-count";
import { BoardTag } from "./board-tag";

const STREAM_LIST_ID = "class-board-livestream-list";
const CALENDAR_LIST_ID = "class-board-calendar-list";

/**
 * Every rail row: the shared leading column, then the content, divided by a top rule (so a list
 * that shows only the rows that fit never ends on a doubled line).
 */
const ROW_BASE = "grid items-center gap-x-4 border-t border-border px-4 py-2.5 first:border-t-0";
/** Livestream rows: lead | title and crew | tags. */
const STREAM_ROW = cn(ROW_BASE, "grid-cols-[var(--b-lead)_minmax(0,1fr)_auto]");
/**
 * Due next rows: lead | stage | date. In a narrow column (a phone, half a tablet) the date and
 * cycle drop under the stage so long stage names keep their room; the TV always uses one line.
 */
const DUE_ROW = cn(
  ROW_BASE,
  "min-h-[var(--b-row)] grid-cols-[var(--b-lead)_minmax(0,1fr)] gap-y-0.5",
  "@md:grid-cols-[var(--b-lead)_minmax(0,1fr)_auto] lg:grid-cols-[var(--b-lead)_minmax(0,1fr)_auto] lg:py-[calc(var(--b)*0.2)]"
);

/**
 * The right rail: ONE card with three sections in order of urgency (what's due, who's needed,
 * what's on). Every section header is the same; the first matches the race header's height.
 * Tablet: Due next over Livestreams on the left, Calendar down the right. lg: one column; Due
 * next takes its rows, then Livestreams and Calendar share the rest (see below).
 */
export function BoardRail({
  deadlines,
  livestreams,
  days,
  todayKey
}: {
  deadlines: ClassBoardDeadline[];
  livestreams: ClassBoardLivestream[];
  days: ClassBoardDay[];
  todayKey: string;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] lg:flex">
      <DueNext deadlines={deadlines} />
      {/*
        lg: a size container for what Due next leaves. The Livestreams list keeps --cal-rows
        calendar days of room free (every school day, or the empty message) before it takes more
        rows, so the calendar shows every day. Below lg it is display: contents and both sections
        sit in the rail's own layout.
      */}
      <div
        className="contents lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:[container-type:size]"
        style={{ "--cal-rows": Math.max(days.length, 2) } as CSSProperties}
      >
        <Livestreams items={livestreams} />
        <Calendar days={days} todayKey={todayKey} />
      </div>
    </div>
  );
}

function RailSection({
  id,
  title,
  meta,
  tall = false,
  className,
  children
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  tall?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-border px-4",
          tall ? "h-[var(--b-head-tall)]" : "h-[var(--b-head)]"
        )}
      >
        <h2 id={id} className={BOARD_TEXT.label}>
          {title}
        </h2>
        {meta ? <p className={cn(BOARD_TEXT.label, "min-w-0 truncate text-muted-foreground")}>{meta}</p> : null}
      </div>
      {children}
    </section>
  );
}

function RailEmpty({ children }: { children: ReactNode }) {
  return <p className={cn(BOARD_TEXT.meta, "px-4 py-3 text-[var(--ink-text)]")}>{children}</p>;
}

/** The soonest stage dates across cycles. Amber only when it's today or tomorrow. */
function DueNext({ deadlines }: { deadlines: ClassBoardDeadline[] }) {
  return (
    <RailSection
      id="class-board-due"
      title="Due next"
      meta="All cycles"
      tall
      className="@container md:col-start-1 md:row-start-1 lg:shrink-0"
    >
      {deadlines.length === 0 ? (
        <RailEmpty>No upcoming deadlines.</RailEmpty>
      ) : (
        <ol>
          {deadlines.map((deadline) => (
            <li key={deadline.id} className={DUE_ROW}>
              <span className="row-span-2 flex min-w-0 @md:row-span-1 lg:row-span-1">
                <BoardTag tone={dueTone(deadline.daysUntil)}>{relativeDaysLabel(deadline.daysUntil)}</BoardTag>
              </span>
              <p className={cn(BOARD_TEXT.body, "line-clamp-2 break-words font-semibold text-foreground")}>{deadline.label}</p>
              <p
                className={cn(
                  BOARD_TEXT.meta,
                  "col-start-2 whitespace-nowrap text-muted-foreground",
                  "@md:col-start-3 @md:row-start-1 @md:text-right lg:col-start-3 lg:row-start-1 lg:text-right"
                )}
              >
                <time dateTime={deadline.dateKey} className="font-mono-broadcast tabular-nums">
                  {formatGateDate(deadline.dateKey)}
                </time>
                {` · Cycle ${deadline.cycleNumber}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </RailSection>
  );
}

/**
 * Every scheduled livestream in the next two weeks. On lg the list gets the height the calendar
 * doesn't need (the two section headers and rules, and --cal-rows days at their smallest), at
 * least one row, and shows only the whole rows that fit there (auto-fit rows of one fixed height;
 * the rest fall into zero-height rows past the clipped edge), so a row is never cut in half. The
 * header then says "+N more" for the livestreams left off (BoardRowCount).
 */
function Livestreams({ items }: { items: ClassBoardLivestream[] }) {
  return (
    <RailSection
      id="class-board-livestreams"
      title="Livestreams"
      meta={items.length > 0 ? <BoardRowCount listId={STREAM_LIST_ID} total={items.length} showTotal /> : "Next 14 days"}
      className="border-t border-border md:col-start-1 md:row-start-2 lg:shrink-0"
    >
      {items.length === 0 ? (
        <RailEmpty>No livestreams in the next two weeks.</RailEmpty>
      ) : (
        <ul
          id={STREAM_LIST_ID}
          className="lg:grid lg:max-h-[max(var(--b-stream),calc(100cqh_-_var(--b-head)*2_-_2px_-_var(--cal-rows)*var(--b-day)))] lg:auto-rows-[0px] lg:grid-rows-[repeat(auto-fit,var(--b-stream))] lg:overflow-hidden"
        >
          {items.map((item) => (
            <LivestreamRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </RailSection>
  );
}

/** [day / time] [title, then crew · place · availability] [Started and the capacity tag]. */
function LivestreamRow({ item }: { item: ClassBoardLivestream }) {
  const day = formatBoardDay(item.dateKey);
  return (
    <li className={cn(STREAM_ROW, "lg:overflow-hidden lg:py-0")}>
      <p className="min-w-0" title={item.dayLabel}>
        <span className="sr-only">{item.dayLabel}, </span>
        <time aria-hidden="true" dateTime={item.dateKey} className={cn(BOARD_TEXT.mono, "block text-muted-foreground")}>
          {day.weekday} {day.dayNum}
        </time>
        <span className={cn(BOARD_TEXT.mono, "block text-foreground")}>{item.timeLabel}</span>
      </p>
      <div className="min-w-0">
        <h3 className={cn(BOARD_TEXT.body, "truncate font-semibold text-foreground")}>{item.title}</h3>
        <p className={cn(BOARD_TEXT.meta, "line-clamp-2 break-words text-[var(--ink-text)] lg:line-clamp-1")}>
          {item.crew === CREW_OPEN ? (
            CREW_OPEN
          ) : (
            <>
              <span className={BOARD_TEXT.role}>Crew</span>
              {item.crew}
            </>
          )}
          {item.where ? ` · ${item.where}` : null}
          {` · ${item.availability}`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 lg:flex-row lg:items-center lg:gap-[calc(var(--b-tag)*0.4)]">
        {item.started ? <BoardTag tone="success">Started</BoardTag> : null}
        <BoardTag tone={CAPACITY_TONE[item.tone]}>{item.openLabel}</BoardTag>
      </div>
    </li>
  );
}

/**
 * Two weeks of school days. The kind tags sit in one shared column (a subgrid, with 1rem gutter
 * tracks so a row's fill reaches the card edge) so every row's names start at the same edge. On
 * lg each day is one line and the rows share the rail's leftover height, which has room for
 * every day (Livestreams leaves it) except on a short screen (such as 1024×768). There the last
 * days are left off whole (auto-fit rows; the rest fall past the clipped edge), never cut in half,
 * and the header says "+N more" for them (BoardRowCount).
 */
function Calendar({ days, todayKey }: { days: ClassBoardDay[]; todayKey: string }) {
  return (
    <RailSection
      id="class-board-calendar"
      title="Calendar"
      meta={days.length > 0 ? <BoardRowCount listId={CALENDAR_LIST_ID} total={days.length} /> : "Next 14 days"}
      className={cn(
        "border-t border-border md:col-start-2 md:row-[1/3] md:border-l md:border-t-0",
        "lg:min-h-0 lg:flex-1 lg:border-l-0 lg:border-t"
      )}
    >
      {days.length === 0 ? (
        <RailEmpty>No school days in the next two weeks.</RailEmpty>
      ) : (
        <ol
          id={CALENDAR_LIST_ID}
          className="grid grid-cols-[1rem_var(--b-lead)_1rem_auto_1rem_minmax(0,1fr)_1rem] lg:min-h-0 lg:flex-1 lg:auto-rows-[0px] lg:grid-rows-[repeat(auto-fit,minmax(var(--b-day),1fr))] lg:overflow-hidden"
        >
          {days.map((day) => (
            <CalendarRow key={day.date} day={day} today={day.date === todayKey} />
          ))}
        </ol>
      )}
    </RailSection>
  );
}

function CalendarRow({ day, today }: { day: ClassBoardDay; today: boolean }) {
  const tag = dayKindTag(day);
  const lines = tag.note ? [tag.note, ...day.lines] : day.lines;
  const off = day.kind === "HOLIDAY";
  return (
    <li
      aria-current={today ? "date" : undefined}
      className={cn(
        "col-span-full grid grid-cols-subgrid items-center border-t border-border py-2.5 first:border-t-0 lg:overflow-hidden lg:py-[calc(var(--b)*0.2)]",
        today && "bg-[var(--ink-3)]"
      )}
    >
      <p className="col-start-2 whitespace-nowrap font-mono-broadcast tabular-nums leading-none">
        <span className={cn("text-[length:var(--b-mono)]", today ? "text-[var(--brand-green)]" : "text-muted-foreground")}>
          {day.weekday}
        </span>
        <span className={cn("ml-[0.35em] text-[length:var(--b)] font-medium", off ? "text-muted-foreground" : "text-foreground")}>
          {day.dayNum}
        </span>
        {today ? <span className="sr-only"> (today)</span> : null}
      </p>
      <span className="col-start-4 flex min-w-0">
        <BoardTag tone={tag.tone}>{tag.label}</BoardTag>
      </span>
      {lines.length > 0 ? (
        // One truncated line per day on the TV (phones wrap and show every name).
        <p className={cn(BOARD_TEXT.meta, "col-start-6 min-w-0 break-words lg:truncate", off ? "text-muted-foreground" : "text-foreground")}>
          {lines.map((line, index) => {
            const { role, value } = splitRoleLine(line);
            return (
              <span key={index} className="mr-[1em] last:mr-0">
                {role ? <span className={BOARD_TEXT.role}>{role}</span> : null}
                {value}
              </span>
            );
          })}
        </p>
      ) : null}
    </li>
  );
}
