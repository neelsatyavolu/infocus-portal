"use client";

import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { cn } from "@/src/lib/utils";

/** `/meetings?agenda=<meetingId>` opens that meeting's editor (the in-call "Edit agenda" link). */
export const AGENDA_QUERY_PARAM = "agenda";

export function agendaEditorHref(meetingId: string) {
  return `/meetings?${AGENDA_QUERY_PARAM}=${encodeURIComponent(meetingId)}`;
}

/**
 * Meetings tab: the "Agenda n" button in a meeting row. It only asks to open; the tab owns the
 * one MeetingAgendaSheet, so the sheet (and a half-typed item) stays open when the row moves
 * from Upcoming to Join now. The count sits at the right edge, so buttons of one width line up
 * down a list. `compactOnPhone`: below md only the icon and count show (the name stays in the
 * label), in a fixed 56px (room for a two-digit count), so every row's actions column has the
 * same width and titles and buttons start at the same x down the list.
 */
export function AgendaButton({
  meeting,
  count,
  onOpen,
  compactOnPhone = false,
  className
}: {
  meeting: Pick<MeetingSummary, "id" | "title">;
  /** The agenda's item count: the list's agendaCount, or the sheet's live count once it loaded. */
  count: number;
  onOpen: () => void;
  compactOnPhone?: boolean;
  className?: string;
}) {
  const countLabel = count ? `, ${count} ${count === 1 ? "item" : "items"}` : "";
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onOpen}
      aria-label={`Agenda for ${meeting.title}${countLabel}`}
      className={cn("justify-start", compactOnPhone && "max-md:w-14 max-md:justify-center max-md:gap-1.5 max-md:px-2", className)}
    >
      <ListChecks aria-hidden />
      <span className={cn(compactOnPhone && "max-md:hidden")}>Agenda</span>
      {count ? (
        <span className={cn("ml-auto font-mono text-xs tabular-nums text-muted-foreground", compactOnPhone && "max-md:ml-0")}>{count}</span>
      ) : null}
    </Button>
  );
}
