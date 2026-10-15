"use client";

import type { MouseEvent, ReactNode } from "react";
import { CheckCheck, Pencil, UserPlus } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu } from "@/components/kit/menu";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { LIVESTREAM_AVAILABILITY_LABELS } from "@/src/lib/livestream";
import { cn } from "@/src/lib/utils";
import {
  arrivalLabel,
  attendeeHours,
  canRequest,
  capacityTag,
  dayWord,
  firstName,
  formatDay,
  formatHours,
  formatMonth,
  formatTime,
  formatWeekday,
  hasOwnHours,
  needsCompletion,
  personalStatus,
  type EventRow,
  type Payload
} from "./livestreams-model";

/** What a row or card needs to draw itself and act. */
export type EventContext = {
  payload: Payload;
  now: Date;
  /** Events with news for me since my last visit. */
  newIds: ReadonlySet<string>;
  onRequest: (event: EventRow) => void;
  onEdit: (event: EventRow) => void;
  onComplete: (event: EventRow) => void;
  onOpenRequests: (event: EventRow) => void;
};

export function stop(event: MouseEvent) {
  event.stopPropagation();
}

/** Month and day number as a small square; the full date is read out for screen readers. */
export function DateChip({ iso, now }: { iso: string; now: Date }) {
  const today = dayWord(iso, now) === "Today";
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md border leading-none",
        today ? "border-[var(--brand-green)]/50 bg-[var(--brand-green)]/10" : "border-border"
      )}
    >
      <span aria-hidden className="text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        {formatMonth(iso)}
      </span>
      <span aria-hidden className="mt-1 font-mono-broadcast text-[17px] font-medium tabular-nums text-foreground">
        {new Date(iso).getDate()}
      </span>
      <span className="sr-only">{formatDay(iso)}</span>
    </span>
  );
}

/** "Today" / "Tomorrow" in foreground weight, otherwise the weekday. */
export function DayWord({ iso, now }: { iso: string; now: Date }) {
  const word = dayWord(iso, now);
  return word ? <span className="font-medium text-foreground">{word}</span> : <>{formatWeekday(iso)}</>;
}

/** Arrival first (what the crew needs), then the day and the event start. */
export function WhenText({ event, now }: { event: EventRow; now: Date }) {
  const start = `${dayWord(event.startsAt, now) ?? formatWeekday(event.startsAt)} · Starts ${formatTime(event.startsAt)}`;
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium tabular-nums text-foreground">{arrivalLabel(event)}</span>
      <span className="block truncate text-xs tabular-nums text-muted-foreground" title={start}>
        <DayWord iso={event.startsAt} now={now} /> · Starts {formatTime(event.startsAt)}
      </span>
    </span>
  );
}

export function placeLine(event: EventRow) {
  return `${event.location || "Location TBD"} · ${LIVESTREAM_AVAILABILITY_LABELS[event.availability]}`;
}

export function crewNames(event: EventRow) {
  return event.attendees.map(firstName).join(", ");
}

/** "2/4" in mono with the capacity tag (Scheduled livestreams). */
export function CrewCount({ event, ctx }: { event: EventRow; ctx: EventContext }) {
  const tag = capacityTag(event, ctx.now, ctx.payload.canManage);
  return (
    <>
      <span className="font-mono-broadcast text-[13px] tabular-nums text-foreground">
        {event.attendeeCount}
        <span className="text-muted-foreground">/{event.capacity}</span>
      </span>
      {tag ? <StatusTag tone={tag.tone}>{tag.label}</StatusTag> : null}
    </>
  );
}

/** Managers: "+2 requests →" opens Sign ups at this event. A link-styled button, never a tag. */
export function RequestsLink({ event, ctx, className }: { event: EventRow; ctx: EventContext; className?: string }) {
  if (!ctx.payload.canManage || event.pendingSignupCount <= 0) return null;
  const count = event.pendingSignupCount;
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        ctx.onOpenRequests(event);
      }}
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm text-[13px] font-medium text-[var(--brand-green)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-10",
        className
      )}
    >
      +{count} {count === 1 ? "request" : "requests"} →
    </button>
  );
}

/** Credited hours: mine when I have my own override, otherwise the event default. */
export function HoursValue({ event, userId }: { event: EventRow; userId: string }) {
  if (hasOwnHours(event, userId)) {
    const mine = attendeeHours(event, userId) ?? 0;
    return (
      <span title={`Event default ${formatHours(event.hours ?? 0)} h`}>
        <span className="block font-mono-broadcast text-[13px] tabular-nums text-foreground">{formatHours(mine)}</span>
        <span className="block text-[11px] text-muted-foreground">yours</span>
      </span>
    );
  }
  return (
    <span className="font-mono-broadcast text-[13px] tabular-nums text-foreground">
      {event.hours == null ? <span className="text-muted-foreground">—</span> : formatHours(event.hours)}
    </span>
  );
}

/** " · 3 h" for a card line; my own hours when I have an override. */
export function hoursText(event: EventRow, userId: string) {
  if (hasOwnHours(event, userId)) return ` · ${formatHours(attendeeHours(event, userId) ?? 0)} h (yours)`;
  return event.hours == null ? "" : ` · ${formatHours(event.hours)} h`;
}

/** True when EventTags draws a visible tag (a Scheduled livestream has none of its own). */
export function hasVisibleTags(event: EventRow, ctx: EventContext) {
  const { payload, now } = ctx;
  if (event.status !== "SCHEDULED") return true;
  if (payload.canManage && needsCompletion(event, now)) return true;
  return personalStatus(event, payload.currentUserId, payload.mySignups) !== null;
}

/** True when EventActions (without the Edit icon) draws a button. */
export function hasActions(event: EventRow, ctx: EventContext) {
  const { payload, now } = ctx;
  return canRequest(event, payload) || (payload.canManage && needsCompletion(event, now));
}

/**
 * The event's status (a past livestream still Scheduled reads "Not completed" for managers),
 * then my own status. Tags only; the buttons live in EventActions. Scheduled is the normal
 * state, so it is read out for screen readers but takes no tag.
 */
export function EventTags({ event, ctx }: { event: EventRow; ctx: EventContext }) {
  const { payload, now } = ctx;
  const tags: ReactNode[] = [];
  if (event.status === "COMPLETED") {
    tags.push(<StatusTag key="status" tone="success">Completed</StatusTag>);
  } else if (event.status === "CANCELLED") {
    tags.push(
      <StatusTag key="status" tone="neutral" title="Cancelled">
        <span className="line-through">Cancelled</span>
      </StatusTag>
    );
  } else if (payload.canManage && needsCompletion(event, now)) {
    tags.push(
      <StatusTag key="status" tone="warning" title="Edit it to mark it Completed with hours, or Cancelled">
        Not completed
      </StatusTag>
    );
  } else {
    tags.push(
      <span key="status" className="sr-only">
        Scheduled
      </span>
    );
  }
  const mine = personalStatus(event, payload.currentUserId, payload.mySignups);
  if (mine === "crew") tags.push(<StatusTag key="mine" tone="success">On crew</StatusTag>);
  if (mine === "pending") tags.push(<StatusTag key="mine" tone="warning">Pending</StatusTag>);
  if (mine === "denied") tags.push(<StatusTag key="mine" tone="danger">Denied</StatusTag>);
  return <>{tags}</>;
}

/**
 * Row buttons: Sign up / Request again (when the API would accept it), and for managers
 * "Complete…" on a past livestream still marked Scheduled. `edit="icon"` adds the Edit button
 * (every row for managers, so the plain editor always has a keyboard path); cards show their
 * own Edit in the header instead. When a table row would need all three (a producer on a past
 * livestream with open seats), Complete… stays and the other two fold into one ⋯ menu, so the
 * Actions column never overflows.
 */
export function EventActions({
  event,
  ctx,
  size = "sm",
  edit = "none",
  className
}: {
  event: EventRow;
  ctx: EventContext;
  size?: "sm" | "touch";
  edit?: "icon" | "none";
  className?: string;
}) {
  const { payload, now } = ctx;
  const request = canRequest(event, payload);
  const denied = personalStatus(event, payload.currentUserId, payload.mySignups) === "denied";
  const complete = payload.canManage && needsCompletion(event, now);
  const showEdit = payload.canManage && edit === "icon";
  if (!request && !complete && !showEdit) return null;
  const height = size === "touch" ? "h-10 md:h-9" : "h-8";
  const requestLabel = denied ? "Request again" : "Sign up";
  const fold = request && complete && showEdit;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {request && !fold ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(height, size === "touch" && "flex-1 text-sm")}
          aria-label={`${requestLabel} for ${event.title}`}
          onClick={(e) => {
            stop(e);
            ctx.onRequest(event);
          }}
        >
          {requestLabel}
        </Button>
      ) : null}
      {complete ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(height, size === "touch" && "flex-1 text-sm")}
          aria-label={`Complete ${event.title}`}
          onClick={(e) => {
            stop(e);
            ctx.onComplete(event);
          }}
        >
          <CheckCheck aria-hidden />
          Complete…
        </Button>
      ) : null}
      {fold ? (
        // The menu renders in a portal, but its clicks still bubble through React to the row.
        <span className="flex" onClick={stop}>
          <ActionMenu
            label={`More actions for ${event.title}`}
            size="sm"
            items={[
              { key: "request", label: requestLabel, icon: UserPlus, onSelect: () => ctx.onRequest(event) },
              { key: "edit", label: "Edit", icon: Pencil, onSelect: () => ctx.onEdit(event) }
            ]}
          />
        </span>
      ) : showEdit ? (
        <IconButton
          label={`Edit ${event.title}`}
          icon={Pencil}
          size={size === "touch" ? "touch" : "sm"}
          onClick={(e) => {
            stop(e);
            ctx.onEdit(event);
          }}
        />
      ) : null}
    </span>
  );
}
