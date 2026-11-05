"use client";

import type { ReactNode } from "react";
import { CalendarClock, History, Pencil } from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { fieldLabelClass } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { SectionLabel } from "@/components/kit/section";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { useElementSize } from "@/components/meetings/call/use-element-size";
import { cn } from "@/src/lib/utils";
import {
  CrewCount,
  DateChip,
  DayWord,
  EventActions,
  EventTags,
  HoursValue,
  hasActions,
  hasVisibleTags,
  RequestsLink,
  WhenText,
  crewNames,
  hoursText,
  placeLine,
  stop,
  type EventContext
} from "./event-parts";
import { arrivalLabel, formatTime, personLabel, type EventRow } from "./livestreams-model";

/**
 * Seven tracks: When · Livestream (title, then location and availability) · Crew (count,
 * capacity, then the requests link and names) · Manager · Hours · Status (tags only) · Actions
 * (buttons only). Every row is its own grid, so the tracks are fixed or fractional, never
 * content-sized, and the columns line up. Status and Actions are sized for the longest tag and
 * button set the viewer's role can get (managers: "Not completed", and "Complete…" or "Request
 * again" beside Edit; everyone else: "Completed", "Request again"), the same on every row, and
 * the rest of the width goes to Livestream, Crew and Manager. The table starts at the content
 * width where those three keep readable room (about 175px, 120px and 85px): 60rem for everyone
 * else (a 1280px laptop with the sidebar open), 65rem for managers, whose Status and Actions
 * tracks are wider. Below that, a card grid.
 */
const GRID_BASE = "grid items-center gap-3 px-4";
const GRID_MANAGE = "grid-cols-[12.5rem_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_3.5rem_8.5rem_10rem]";
const GRID_MEMBER = "grid-cols-[12.5rem_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_3.5rem_7rem_7.5rem]";

function gridClass(canManage: boolean) {
  return cn(GRID_BASE, canManage ? GRID_MANAGE : GRID_MEMBER);
}
const TABLE_MIN_WIDTH_MANAGE = 65 * 16;
const TABLE_MIN_WIDTH_MEMBER = 60 * 16;
const TABLE_COLUMNS = ["When", "Livestream", "Crew", "Manager", "Hours", "Status", ""];
/** Auto-fill cards that follow the container, equal height per row (kit CardGrid, as a list). */
const CARD_GRID =
  "grid min-w-0 gap-3 md:gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]";

function NewDot({ show, className }: { show: boolean; className?: string }) {
  return show ? <StatusDot tone="new" label="New since your last visit" className={className} /> : null;
}

function TableRow({ event, ctx }: { event: EventRow; ctx: EventContext }) {
  const { payload, now } = ctx;
  const names = crewNames(event);
  return (
    <li
      // A mouse convenience for managers; the Edit button is the keyboard path.
      onClick={payload.canManage ? () => ctx.onEdit(event) : undefined}
      className={cn(
        gridClass(payload.canManage),
        "min-h-16 border-t border-border py-3 transition-colors",
        payload.canManage && "cursor-pointer hover:bg-[var(--ink-3)]"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <DateChip iso={event.startsAt} now={now} />
        <WhenText event={event} now={now} />
      </div>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <NewDot show={ctx.newIds.has(event.id)} />
          <span className="truncate text-sm font-medium text-foreground" title={event.title}>
            {event.title}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground" title={placeLine(event)}>
          {placeLine(event)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <span className="sr-only">Crew</span>
          <CrewCount event={event} ctx={ctx} />
        </p>
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <RequestsLink event={event} ctx={ctx} className="text-xs" />
          <span className="min-w-0 truncate" title={names || undefined}>
            {names || "No crew yet"}
          </span>
        </p>
      </div>
      <div className="min-w-0">
        <span className="sr-only">Manager</span>
        {event.manager ? (
          <p className="truncate text-[13px] text-foreground" title={personLabel(event.manager)}>
            {personLabel(event.manager)}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">—</p>
        )}
      </div>
      <div className="text-right">
        <span className="sr-only">Hours</span>
        <HoursValue event={event} userId={payload.currentUserId} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="sr-only">Status</span>
        <EventTags event={event} ctx={ctx} />
      </div>
      <div className="flex min-w-0 justify-end">
        <EventActions event={event} ctx={ctx} edit="icon" className="flex-wrap justify-end" />
      </div>
    </li>
  );
}

function EventCard({ event, ctx }: { event: EventRow; ctx: EventContext }) {
  const { payload, now } = ctx;
  const names = crewNames(event);
  // Only rows with something visible take space, so a card never ends in an empty gap.
  const tagRow = hasVisibleTags(event, ctx) || (payload.canManage && event.pendingSignupCount > 0);
  const actions = hasActions(event, ctx);
  return (
    <li
      // A mouse convenience for managers; the Edit button is the keyboard path.
      onClick={payload.canManage ? () => ctx.onEdit(event) : undefined}
      className={cn(
        "flex h-full min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-4 transition-colors",
        payload.canManage && "cursor-pointer hover:bg-[var(--ink-3)]"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <DateChip iso={event.startsAt} now={now} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
            <NewDot show={ctx.newIds.has(event.id)} className="mr-2 align-middle" />
            {event.title}
          </p>
          <p className="truncate text-[13px] text-muted-foreground">{placeLine(event)}</p>
        </div>
        {payload.canManage ? (
          <IconButton
            label={`Edit ${event.title}`}
            icon={Pencil}
            size="touch"
            onClick={(e) => {
              stop(e);
              ctx.onEdit(event);
            }}
          />
        ) : null}
      </div>
      <div className="space-y-1 text-[13px]">
        <p className="tabular-nums text-[var(--ink-text)]">
          <DayWord iso={event.startsAt} now={now} /> · {arrivalLabel(event)} · Starts {formatTime(event.startsAt)}
          {hoursText(event, payload.currentUserId)}
        </p>
        <p className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">Crew</span>
          <CrewCount event={event} ctx={ctx} />
          <span className="min-w-0 truncate text-muted-foreground" title={names || undefined}>
            {names || "No crew yet"}
          </span>
        </p>
        {event.manager ? <p className="truncate text-muted-foreground">Manager {personLabel(event.manager)}</p> : null}
      </div>
      {tagRow || actions ? (
        <div className="mt-auto flex flex-col gap-3">
          {tagRow ? (
            <div className="flex flex-wrap items-center gap-2">
              <RequestsLink event={event} ctx={ctx} className="mr-auto" />
              <EventTags event={event} ctx={ctx} />
            </div>
          ) : (
            <EventTags event={event} ctx={ctx} />
          )}
          {actions ? <EventActions event={event} ctx={ctx} size="touch" className="w-full" /> : null}
        </div>
      ) : (
        <EventTags event={event} ctx={ctx} />
      )}
    </li>
  );
}

function Rows({ events, ctx, table }: { events: EventRow[]; ctx: EventContext; table: boolean }) {
  if (table) {
    return (
      <ul>
        {events.map((event) => (
          <TableRow key={event.id} event={event} ctx={ctx} />
        ))}
      </ul>
    );
  }
  return (
    <ul className={CARD_GRID}>
      {events.map((event) => (
        <EventCard key={event.id} event={event} ctx={ctx} />
      ))}
    </ul>
  );
}

/** Caps group heading with a 16px leading icon, so its text lines up with the Earlier toggle's text after the chevron. */
function GroupHeading({ icon, children, count, table }: { icon: ReactNode; children: ReactNode; count: number; table: boolean }) {
  return (
    <SectionLabel as="h2" count={count} className={cn("h-9", table && "px-4")}>
      <span className="inline-flex items-center gap-2">
        {icon}
        {children}
      </span>
    </SectionLabel>
  );
}

const GROUP_ICON = "h-4 w-4 shrink-0 text-muted-foreground";

/**
 * The schedule in two groups: Today and upcoming, then Earlier this semester (folds away when
 * the list is unfiltered). Wide content columns get one aligned table card (no sideways scroll);
 * narrower ones get equal-height cards that follow the column width, not the viewport.
 */
export function ScheduleList({
  upcoming,
  earlier,
  filtered,
  toComplete,
  earlierOpen,
  onEarlierOpenChange,
  ctx
}: {
  upcoming: EventRow[];
  earlier: EventRow[];
  /** A filter is on: both groups are short, so neither folds and empty ones hide. */
  filtered: boolean;
  /** Earlier livestreams still marked Scheduled (managers). */
  toComplete: number;
  earlierOpen: boolean;
  onEarlierOpenChange: (open: boolean) => void;
  ctx: EventContext;
}) {
  const [measure, { width }] = useElementSize<HTMLDivElement>();
  const table = width >= (ctx.payload.canManage ? TABLE_MIN_WIDTH_MANAGE : TABLE_MIN_WIDTH_MEMBER);
  const showUpcoming = !filtered || upcoming.length > 0;
  const toCompleteTag = toComplete > 0 ? <StatusTag tone="warning">{toComplete} to mark completed</StatusTag> : null;

  const upcomingGroup = showUpcoming ? (
    <section aria-label="Today and upcoming">
      <GroupHeading icon={<CalendarClock aria-hidden className={GROUP_ICON} />} count={upcoming.length} table={table}>
        Today and upcoming
      </GroupHeading>
      {upcoming.length ? (
        <Rows events={upcoming} ctx={ctx} table={table} />
      ) : (
        <p className={cn("pb-3 text-sm text-muted-foreground", table && "px-4")}>No upcoming livestreams.</p>
      )}
    </section>
  ) : null;

  let earlierGroup: ReactNode = null;
  if (earlier.length && filtered) {
    earlierGroup = (
      <section aria-label="Earlier this semester" className={cn(showUpcoming && (table ? "border-t border-border" : "pt-3"))}>
        <GroupHeading icon={<History aria-hidden className={GROUP_ICON} />} count={earlier.length} table={table}>
          Earlier this semester
        </GroupHeading>
        <Rows events={earlier} ctx={ctx} table={table} />
      </section>
    );
  } else if (earlier.length) {
    earlierGroup = (
      <Disclosure
        variant="section"
        headingAs="h2"
        summary={
          <span className="inline-flex items-center gap-2">
            <span className={fieldLabelClass}>Earlier this semester</span>
            <span className="font-mono-broadcast text-[11px] font-normal tabular-nums text-muted-foreground">{earlier.length}</span>
            {toCompleteTag}
          </span>
        }
        open={earlierOpen}
        onOpenChange={onEarlierOpenChange}
        className={cn(table ? "border-t border-border px-4" : "pt-3")}
        bodyClassName={table ? "-mx-4 pt-0!" : "pt-0!"}
      >
        <Rows events={earlier} ctx={ctx} table={table} />
      </Disclosure>
    );
  }

  return (
    <div ref={measure} className="min-w-0">
      {table ? (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div aria-hidden className={cn(gridClass(ctx.payload.canManage), "h-10 border-b border-border")}>
            {TABLE_COLUMNS.map((label, index) => (
              <span key={index} className={cn(fieldLabelClass, label === "Hours" && "text-right")}>
                {label}
              </span>
            ))}
          </div>
          {upcomingGroup}
          {earlierGroup}
        </div>
      ) : (
        <div>
          {upcomingGroup}
          {earlierGroup}
        </div>
      )}
    </div>
  );
}
