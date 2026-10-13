"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPanel, SettingsPanelBody } from "@/components/settings-layout";
import { groupCalendarDays, type CalendarDayGroup, type CalendarDayRow } from "@/src/lib/calendar-day-groups";
import { selectClass } from "./admin-types";
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
 * Admin → Configuration: days that differ from the usual week (no school, finals, summer,
 * special shows). A day set here always wins over the automatic ones.
 */
export function CalendarDaysPanel({
  days,
  onChanged,
  onResync
}: {
  days: CalendarDayRow[];
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
    <SettingsPanel>
      <SettingsPanelBody className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Days off and special days</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add each no-school day for the year here. A day you set always wins over the automatic calendar, so this is also
            how to air a show in a finals week or on another weekday.
          </p>
        </div>

        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">Date</span>
            <Input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-40 font-mono tabular-nums"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">What happens</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as DayKind)} className={selectClass}>
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-48 flex-1 space-y-1 text-xs text-muted-foreground">
            <span className="block">Name (optional)</span>
            <Input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="Labor Day" />
          </label>
          <Button type="submit" variant="outline" disabled={busy || !date}>
            Save day
          </Button>
        </form>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming days off or special days.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {groups.map((group) => (
              <li key={`${group.from}-${group.source}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono tabular-nums text-foreground">
                  {group.from === group.to ? formatDay(group.from) : `${formatDay(group.from)} to ${formatDay(group.to)}`}
                </span>
                <span className="text-foreground">{group.label || kindLabel(group.kind)}</span>
                <span className="text-xs text-muted-foreground">
                  {group.label ? `${kindLabel(group.kind)} · ` : ""}
                  {sourceLabel(group.source)}
                </span>
                {group.source === "manual" ? (
                  <Button
                    type="button"
                    variant="destructive-quiet"
                    size="sm"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => void remove(group)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}
