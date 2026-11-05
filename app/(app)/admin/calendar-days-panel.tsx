"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/kit/field";
import { StatusTag } from "@/components/kit/status-tag";
import { SettingsPanelHeader } from "@/components/settings-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { groupCalendarDays, type CalendarDayGroup, type CalendarDayRow } from "@/src/lib/calendar-day-groups";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS, RemoveButton, RowsSkeleton } from "./admin-ui";
import { KIND_OPTIONS, formatDay, kindLabel, sourceLabel, type DayKind } from "./configuration-format";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function send(input: RequestInfo, init: RequestInit, fallback: string) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? fallback);
  }
}

/**
 * Date(s) | what happens | name | source | action. The add form uses the same tracks (Date, What
 * happens, Name across name + source, then Save day), so its fields sit over the list's columns.
 * The action column keeps its width on rows that can't be removed.
 */
const DAY_COLUMNS = "@4xl:grid-cols-[13rem_11rem_minmax(0,1fr)_9rem_7.5rem]";
const DAY_GRID = cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1", DAY_COLUMNS);

function dateRange(group: CalendarDayGroup) {
  return group.from === group.to ? formatDay(group.from) : `${formatDay(group.from)} to ${formatDay(group.to)}`;
}

/**
 * Admin → School calendar: days that differ from the usual week (no school, finals, summer,
 * special shows). A day set here always wins over the automatic ones.
 */
export function CalendarDaysPanel({
  days,
  loading,
  onChanged,
  onResync
}: {
  days: CalendarDayRow[];
  loading: boolean;
  onChanged: () => Promise<void>;
  /** Restores an automatic day after its hand-set replacement is removed. */
  onResync: () => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<DayKind>("HOLIDAY");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const today = todayKey();
    return groupCalendarDays(days.filter((day) => day.date >= today));
  }, [days]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!date) return;
    setBusy(true);
    try {
      await send(
        "/api/platform/calendar",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, kind, label }) },
        "Could not save that day."
      );
      await onChanged();
      setDate("");
      setLabel("");
      toast.success(`${formatDay(date)} saved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that day.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: CalendarDayGroup) {
    setBusy(true);
    try {
      for (const day of group.dates) {
        await send(`/api/platform/calendar?date=${day}`, { method: "DELETE" }, "Could not remove that day.");
      }
      // Bring back whatever the school year or Paly's calendar says about those days.
      await onResync();
      toast.success("Removed. Those days follow the automatic calendar again.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that day.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <SettingsPanelHeader
        title="Days off and special days"
        description="Add each no-school day for the year here. A day you set always wins over the automatic calendar, so this is also how to air a show in a finals week or on another weekday."
      />

      <form
        onSubmit={add}
        className={cn("grid gap-3 border-t border-border px-4 py-4 md:px-5 @xl:grid-cols-2 @xl:items-end", DAY_COLUMNS)}
      >
        <Field label="Date" htmlFor="calendar-day-date">
          <Input
            id="calendar-day-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="font-mono tabular-nums"
          />
        </Field>
        <Field label="What happens" htmlFor="calendar-day-kind">
          <NativeSelect id="calendar-day-kind" value={kind} onChange={(event) => setKind(event.target.value as DayKind)}>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Name (optional)" htmlFor="calendar-day-label" className="@4xl:col-span-2">
          <Input
            id="calendar-day-label"
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Labor Day"
          />
        </Field>
        {/* Full width when stacked and in its own last column; beside Name (two columns) it keeps its
            own width, so it doesn't read as another field. */}
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !date}
          className="w-full @xl:w-auto @xl:justify-self-start @4xl:w-full"
        >
          <Plus aria-hidden="true" />
          Save day
        </Button>
      </form>

      {loading ? (
        <RowsSkeleton className="border-t border-border" />
      ) : groups.length === 0 ? (
        <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground md:px-5">
          No upcoming days off or special days.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className={cn(DAY_GRID, "hidden border-t border-border px-4 py-2 @4xl:grid md:px-5")}>
            <span className={COLUMN_LABEL_CLASS}>Date</span>
            <span className={COLUMN_LABEL_CLASS}>What happens</span>
            <span className={COLUMN_LABEL_CLASS}>Name</span>
            <span className={COLUMN_LABEL_CLASS}>Source</span>
            <span />
          </div>
          <ul aria-label="Upcoming days off and special days" className="divide-y divide-border border-t border-border">
            {groups.map((group) => (
              <li key={`${group.from}-${group.source}`} className={cn(DAY_GRID, "px-4 py-2.5 text-sm md:px-5")}>
                <span className="col-start-1 row-start-1 min-w-0 font-mono text-[13px] tabular-nums text-foreground">
                  {dateRange(group)}
                </span>
                {/* Phones: what happens, the name (when it has one) and source share the second line. From @4xl each is its own column. */}
                <span className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @4xl:contents">
                  <span className="flex @4xl:col-start-2 @4xl:row-start-1">
                    <StatusTag size="sm" tone="neutral">
                      {kindLabel(group.kind)}
                    </StatusTag>
                  </span>
                  {group.label ? (
                    <span className="min-w-0 truncate text-foreground @4xl:col-start-3 @4xl:row-start-1">{group.label}</span>
                  ) : (
                    <span aria-hidden="true" className="hidden text-muted-foreground @4xl:col-start-3 @4xl:row-start-1 @4xl:block">
                      —
                    </span>
                  )}
                  <span className="min-w-0 truncate text-[13px] text-muted-foreground @4xl:col-start-4 @4xl:row-start-1">
                    {sourceLabel(group.source)}
                  </span>
                </span>
                <span className="col-start-2 row-span-2 row-start-1 flex justify-end @4xl:col-start-5 @4xl:row-span-1">
                  {group.source === "manual" ? (
                    <RemoveButton label={`Remove ${dateRange(group)}`} disabled={busy} onClick={() => void remove(group)} />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
