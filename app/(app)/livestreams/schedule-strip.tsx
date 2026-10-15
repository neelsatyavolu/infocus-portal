"use client";

import { Alert } from "@/components/kit/alert";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { MetricStrip } from "@/components/kit/stat-tile";
import { StatusTag } from "@/components/kit/status-tag";
import { REQUIRED_MANAGED_LIVESTREAMS } from "@/src/lib/livestream";
import {
  arrivalLabel,
  dayLabel,
  formatHours,
  managedCount,
  nextCall,
  nextLivestream,
  openSlotStats,
  personalHours,
  requestCounts,
  type Payload
} from "./livestreams-model";
import type { LastVisit } from "./use-since-last-visit";

/**
 * From md the strip shows all four cells. Phones keep the first two, so the schedule (find a
 * livestream, sign up) stays above the fold, and the other numbers ride in the schedule
 * toolbar's summary line (`stripOverflow`).
 */
export const FULL_STRIP_QUERY = "(min-width: 768px)";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

type Cell = Parameters<typeof MetricStrip>[0]["items"][number];

/** Open crew seats on every Scheduled livestream, the page's long-standing "Open slots" number. */
function openSlotsCell(payload: Payload): Cell {
  const open = openSlotStats(payload.events);
  return {
    key: "open",
    label: "Open slots",
    value: open.slots,
    hint: open.events ? `Across ${plural(open.events, "livestream", "livestreams")}` : "No open livestreams right now."
  };
}

/** My hours: completed hours out of the requirement, with a bar. The caption explains the number. */
function hoursCell(payload: Payload, now: Date): Cell {
  const { hours, completed, waiting } = personalHours(payload.events, payload.currentUserId, now);
  const hint = waiting
    ? `${waiting} waiting to be marked Completed`
    : completed
      ? `From ${plural(completed, "completed livestream", "completed livestreams")}`
      : "Counts once marked Completed";
  return {
    key: "hours",
    label: "Your hours",
    value: formatHours(hours),
    unit: `/ ${payload.requiredHours} h`,
    progress: Math.min(1, hours / Math.max(1, payload.requiredHours)),
    hint
  };
}

/** Appointed managers are graded on Completed livestreams they managed, not hours. */
function managedCell(payload: Payload): Cell {
  const managed = managedCount(payload.events, payload.currentUserId);
  const remaining = Math.max(0, REQUIRED_MANAGED_LIVESTREAMS - managed);
  return {
    key: "managed",
    label: "You managed",
    value: managed,
    unit: `/ ${REQUIRED_MANAGED_LIVESTREAMS}`,
    hint: remaining ? `${remaining} more for full credit` : "Full credit"
  };
}

/** Students: hours and next call first (the phone pair), then open seats and my requests. */
function studentItems(payload: Payload, now: Date): Cell[] {
  const call = nextCall(payload.events, payload.currentUserId, now);
  const requests = requestCounts(payload.events, payload.currentUserId, payload.mySignups);
  return [
    hoursCell(payload, now),
    {
      key: "call",
      label: "Next call time",
      mono: false,
      value: call ? dayLabel(call.startsAt, now) : "—",
      // The place is on the row; the caption keeps to the one thing a crew member needs.
      hint: call ? arrivalLabel(call) : "You're not on a crew yet",
      title: call ? `${arrivalLabel(call)} · ${call.location || "Location TBD"}` : undefined
    },
    openSlotsCell(payload),
    {
      key: "requests",
      label: "Requests",
      value: requests.pending,
      tag: requests.pending ? <StatusTag tone="warning">Pending</StatusTag> : undefined,
      hint: requests.denied ? `${requests.denied} denied` : requests.pending ? "Waiting for a manager" : "None waiting"
    }
  ];
}

/**
 * Producers and livestream managers: what's next and what to close out first (the phone pair),
 * then where crew is short and their own progress (hours for producers, managed livestreams for
 * appointed managers). Sign-up requests are the Sign ups tab count.
 */
function managerItems(payload: Payload, now: Date, toComplete: number): Cell[] {
  const next = nextLivestream(payload.events, now);
  return [
    {
      key: "next",
      label: "Next livestream",
      mono: false,
      value: next ? dayLabel(next.startsAt, now) : "—",
      // Crew and arrival are on the row; the caption names the livestream.
      hint: next ? <span className="block truncate">{next.title}</span> : "Nothing scheduled",
      title: next?.title
    },
    {
      key: "complete",
      label: "To mark completed",
      value: toComplete,
      hint: toComplete ? "Past livestreams still Scheduled" : "Every past livestream is closed out"
    },
    openSlotsCell(payload),
    payload.canSignup ? hoursCell(payload, now) : managedCell(payload)
  ];
}

/** One number the phone strip leaves out, for the schedule toolbar ("6 open slots"). */
export type StripBit = { key: string; before?: string; value: string | number; after: string; title?: string };

/** The cells phones don't show, as short bits for the schedule toolbar's summary line. */
export function stripOverflow(payload: Payload, now: Date): StripBit[] {
  const slots = openSlotStats(payload.events).slots;
  const open: StripBit = { key: "open", value: slots, after: slots === 1 ? "open slot" : "open slots" };
  if (!payload.canManage) {
    const { pending, denied } = requestCounts(payload.events, payload.currentUserId, payload.mySignups);
    const bits: StripBit[] = [];
    if (pending) bits.push({ key: "pending", value: pending, after: "pending", title: "Your sign-up requests waiting for a manager" });
    if (denied) bits.push({ key: "denied", value: denied, after: "denied", title: "Your denied sign-up requests" });
    return [...bits, open];
  }
  if (payload.canSignup) {
    const { hours } = personalHours(payload.events, payload.currentUserId, now);
    return [open, { key: "you", before: "You", value: formatHours(hours), after: `/ ${payload.requiredHours} h` }];
  }
  return [
    open,
    {
      key: "you",
      before: "You managed",
      value: managedCount(payload.events, payload.currentUserId),
      after: `/ ${REQUIRED_MANAGED_LIVESTREAMS}`
    }
  ];
}

export function ScheduleStrip({
  payload,
  now,
  toComplete,
  visit,
  changesDismissed,
  onDismissChanges
}: {
  payload: Payload;
  now: Date;
  /** Past livestreams still marked Scheduled (managers). */
  toComplete: number;
  visit: LastVisit | null;
  changesDismissed: boolean;
  onDismissChanges: () => void;
}) {
  const full = useMediaQuery(FULL_STRIP_QUERY, true);
  const changes = visit?.changes ?? null;
  const lines = changes?.lines ?? [];
  const items = payload.canManage ? managerItems(payload, now, toComplete) : studentItems(payload, now);
  return (
    <div className="space-y-3">
      {lines.length && !changesDismissed ? (
        // Green only when every line is good news; a denial makes it a plain note.
        <Alert tone={changes?.hasDenial ? "neutral" : "success"} compact onDismiss={onDismissChanges} dismissLabel="Dismiss">
          <span className="font-medium">Since your last visit:</span> {lines.join(" · ")}
        </Alert>
      ) : null}
      <MetricStrip items={full ? items : items.slice(0, 2)} />
    </div>
  );
}
