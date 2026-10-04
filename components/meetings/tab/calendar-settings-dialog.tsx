"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InvitesPanel } from "./invites-panel";

/** Gear button beside the Meetings hero actions; calendar invite settings live in its dialog. */
export function CalendarSettingsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Calendar invite settings" title="Calendar invite settings">
          <Settings aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-h-[85dvh] overflow-y-auto sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Calendar invites</DialogTitle>
          <DialogDescription>Who gets Google Calendar invites for scheduled meetings.</DialogDescription>
        </DialogHeader>
        <InvitesPanel embedded />
      </DialogContent>
    </Dialog>
  );
}
