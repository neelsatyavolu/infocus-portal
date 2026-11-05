"use client";

import { Fragment, type ReactNode } from "react";
import { Plus, Radio } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { EmptyState } from "@/components/kit/empty-state";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Button } from "@/components/ui/button";
import type { EventContext } from "./event-parts";
import {
  filterSchedule,
  groupSchedule,
  scheduleCounts,
  scheduleFilterCounts,
  scheduleFilterOptions,
  type ScheduleFilter
} from "./livestreams-model";
import { ScheduleList } from "./schedule-list";
import { FULL_STRIP_QUERY, stripOverflow } from "./schedule-strip";

const FILTER_LABELS: Record<ScheduleFilter, string> = {
  all: "All",
  open: "Open",
  mine: "Mine",
  action: "Needs action"
};

const FILTER_TITLES: Record<ScheduleFilter, string> = {
  all: "Every livestream this semester",
  open: "Upcoming livestreams you can still request",
  mine: "Livestreams you crew or asked to crew",
  action: "Sign-up requests to review, or past livestreams to mark Completed"
};

const FILTER_EMPTY: Record<Exclude<ScheduleFilter, "all">, string> = {
  open: "No open livestreams right now.",
  mine: "You're not on any crew yet.",
  action: "Nothing needs action."
};

function Num({ value }: { value: number | string }) {
  return <span className="font-mono-broadcast tabular-nums text-foreground">{value}</span>;
}

type MetaBit = { key: string; title?: string; node: ReactNode };

/** "a · b · c", each bit kept whole so a long line wraps between bits, never inside one. */
function MetaLine({ bits }: { bits: MetaBit[] }) {
  return (
    <>
      {bits.map((bit, index) => (
        <Fragment key={bit.key}>
          {index ? " · " : null}
          <span className="whitespace-nowrap" title={bit.title}>
            {bit.node}
          </span>
        </Fragment>
      ))}
    </>
  );
}

export function ScheduleView({
  ctx,
  filter,
  onFilterChange,
  toComplete,
  earlierOpen,
  onEarlierOpenChange,
  onAddEvent
}: {
  ctx: EventContext;
  filter: ScheduleFilter;
  onFilterChange: (filter: ScheduleFilter) => void;
  toComplete: number;
  earlierOpen: boolean;
  onEarlierOpenChange: (open: boolean) => void;
  onAddEvent: () => void;
}) {
  const { payload, now } = ctx;
  // Phones show two strip cells; the rest of the strip's numbers lead this summary line.
  const fullStrip = useMediaQuery(FULL_STRIP_QUERY, true);

  if (!payload.events.length) {
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState
          size="page"
          icon={Radio}
          title="No livestreams yet"
          description={
            payload.canManage ? "Add the first event to start the semester schedule." : "Check back once producers post the schedule."
          }
          action={
            payload.canManage ? (
              <Button type="button" variant="outline" onClick={onAddEvent}>
                <Plus aria-hidden />
                Add event
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const counts = scheduleCounts(payload.events);
  const filterCounts = scheduleFilterCounts(payload, now);
  const shown = filterSchedule(payload.events, filter, payload, now);
  const groups = groupSchedule(shown, now);
  const bits: MetaBit[] = [
    ...(fullStrip ? [] : stripOverflow(payload, now)).map((bit) => ({
      key: bit.key,
      title: bit.title,
      node: (
        <>
          {bit.before ? `${bit.before} ` : null}
          <Num value={bit.value} /> {bit.after}
        </>
      )
    })),
    { key: "total", node: <><Num value={counts.total} /> livestreams</> },
    { key: "scheduled", node: <><Num value={counts.scheduled} /> scheduled</> },
    { key: "completed", node: <><Num value={counts.completed} /> completed</> },
    { key: "cancelled", node: <><Num value={counts.cancelled} /> cancelled</> }
  ];

  return (
    <section aria-label="Schedule" className="space-y-3">
      <Toolbar
        aria-label="Schedule filters"
        start={
          <SegmentedControl
            ariaLabel="Show"
            value={filter}
            onChange={onFilterChange}
            options={scheduleFilterOptions(payload).map((value) => ({
              value,
              label: FILTER_LABELS[value],
              title: FILTER_TITLES[value],
              count: value === "all" ? undefined : filterCounts[value]
            }))}
          />
        }
        meta={<MetaLine bits={bits} />}
      />
      {shown.length === 0 && filter !== "all" ? (
        <div className="rounded-md border border-border bg-card">
          <EmptyState
            size="inline"
            title={FILTER_EMPTY[filter]}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => onFilterChange("all")}>
                Show all
              </Button>
            }
          />
        </div>
      ) : (
        <ScheduleList
          upcoming={groups.upcoming}
          earlier={groups.earlier}
          filtered={filter !== "all"}
          toComplete={payload.canManage ? toComplete : 0}
          earlierOpen={earlierOpen}
          onEarlierOpenChange={onEarlierOpenChange}
          ctx={ctx}
        />
      )}
    </section>
  );
}
