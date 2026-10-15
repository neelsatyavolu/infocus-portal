"use client";

import { Sheet } from "@/components/kit/sheet";
import { InvitesPanel } from "./invites-panel";

/**
 * The Calendar invites sheet (opened from the InFocus Producer Meeting card). The panel mounts
 * only while the sheet is open, so the invite list is fetched fresh on each open and never on a
 * plain visit.
 */
export function CalendarInvitesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Calendar invites"
      description="Who gets Google Calendar invites for scheduled meetings. Invites go out automatically for every scheduled meeting; private meetings only go to linked people. Moves and cancellations update calendars automatically."
      width="lg"
    >
      <InvitesPanel />
    </Sheet>
  );
}
