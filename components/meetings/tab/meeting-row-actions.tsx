"use client";

import Link from "next/link";
import { CalendarClock, CalendarX, Link2, MoreHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgendaButton } from "@/components/meetings/agenda/agenda-button";
import { meetingUrl } from "@/src/lib/meetings/links";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { cn } from "@/src/lib/utils";
import { copyLinkWithToast } from "./copy-link-button";
import { MeetingMenu, type MeetingMenuItem } from "./meeting-menu";
import { ROW_CONTROL } from "./meeting-row-parts";

const meetHref = (id: string) => `/meet/${encodeURIComponent(id)}` as never;

type RowHandlers = {
  onMove?: (meeting: MeetingSummary) => void;
  onCancel?: (meeting: MeetingSummary) => void;
};

/** The ⋯ menu: Copy link (one-off meetings), Move… and Cancel meeting… (hosts, not while live). */
function rowMenuItems(meeting: MeetingSummary, { onMove, onCancel }: RowHandlers): MeetingMenuItem[] {
  // A live meeting can't be moved or cancelled (End for everyone ends it).
  const manageable = meeting.canEdit && meeting.status !== "LIVE";
  const items: Array<MeetingMenuItem | null> = [
    // The series has one stable link (Copy link on the InFocus Producer Meeting card).
    meeting.seriesKey
      ? null
      : { key: "copy", label: "Copy link", icon: Link2, onSelect: () => void copyLinkWithToast(meetingUrl(meeting.id)) },
    manageable && onMove ? { key: "move", label: "Move…", icon: CalendarClock, onSelect: () => onMove(meeting) } : null,
    manageable && onCancel
      ? { key: "cancel", label: "Cancel meeting…", icon: CalendarX, tone: "danger", onSelect: () => onCancel(meeting) }
      : null
  ];
  return items.filter((item): item is MeetingMenuItem => item !== null);
}

/**
 * Whether any row has a ⋯ menu; without one, no ⋯ column is reserved. The Meetings tab asks once
 * for the Now and Upcoming rows together, so both panels' action columns line up.
 */
export function anyRowMenu(meetings: MeetingSummary[], handlers: RowHandlers) {
  return meetings.some((meeting) => rowMenuItems(meeting, handlers).length > 0);
}

/**
 * A meeting row's actions, in fixed slots so they line up down every list: Agenda with its count,
 * the ⋯ menu (an equal blank keeps the column when a row has none), then Join, or a muted
 * "Opens 9:10 PM" when it isn't open yet. Status never sits here.
 * On phones Agenda shrinks to its icon and count and Join gets its own full-width line; the
 * "Opens" time moves to the end of the row's lead line (the panel passes it to RowLead).
 */
export function MeetingRowActions({
  meeting,
  joinable,
  primary = false,
  opensAt,
  showMenuSlot,
  agendaCount,
  onAgenda,
  onMove,
  onCancel
}: {
  meeting: MeetingSummary;
  joinable: boolean;
  /** The one filled Join in view; the rest are outline. */
  primary?: boolean;
  /** "9:10 PM": when a not-yet-open meeting opens. */
  opensAt?: string | null;
  /** Reserve the ⋯ column (some row in the Now or Upcoming panel has a menu). */
  showMenuSlot: boolean;
  /** The Agenda button's count (the tab keeps it current after edits in the sheet). */
  agendaCount: number;
  /** Opens the tab's agenda sheet for this meeting. */
  onAgenda: (meeting: MeetingSummary) => void;
} & RowHandlers) {
  const items = rowMenuItems(meeting, { onMove, onCancel });
  const join = (className: string) => (
    <Link
      href={meetHref(meeting.id)}
      aria-label={`Join ${meeting.title}`}
      className={cn(buttonVariants({ size: "sm", variant: primary ? "default" : "outline" }), className)}
    >
      Join
    </Link>
  );

  return (
    <>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <AgendaButton
          meeting={meeting}
          count={agendaCount}
          onOpen={() => onAgenda(meeting)}
          compactOnPhone
          className={cn("md:w-[7.5rem]", ROW_CONTROL)}
        />
        {items.length > 0 ? (
          <MeetingMenu
            label={`More for ${meeting.title}`}
            items={items}
            trigger={
              <Button variant="outline" size="icon-sm" aria-label={`More for ${meeting.title}`} title="More" className="h-10 w-10 md:h-8 md:w-8">
                <MoreHorizontal aria-hidden />
              </Button>
            }
          />
        ) : showMenuSlot ? (
          <span aria-hidden className="w-10 shrink-0 md:w-8" />
        ) : null}
        <div className="hidden w-28 shrink-0 justify-end md:flex">
          {joinable ? (
            join(cn("w-full", ROW_CONTROL))
          ) : opensAt ? (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              Opens <span className="font-mono tabular-nums">{opensAt}</span>
            </span>
          ) : null}
        </div>
      </div>
      {joinable ? join("col-span-full h-10 w-full md:hidden") : null}
    </>
  );
}
