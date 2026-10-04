"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { leaveChoices } from "@/src/lib/meetings/client/leave";
import { pointerSafeAutoFocus } from "../focus-modality";
import { ConfirmDialog } from "../confirm-dialog";

/**
 * Leave confirm. Hosts also get "End meeting for everyone", which goes through the existing
 * /end flow; the solid Danger style appears only on that final confirm.
 */
export function LeaveDialog({
  open,
  onOpenChange,
  meetingId,
  isHost,
  selfUid,
  participants,
  onLeave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  isHost: boolean;
  selfUid: string | null;
  participants: readonly MeetingParticipantView[];
  onLeave: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const choices = leaveChoices({ isHost, selfUid, participants });

  async function endForEveryone() {
    try {
      await meetingsApi.end(meetingId);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't end the meeting."));
      throw err;
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="max-w-sm outline-none [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{choices.title}</DialogTitle>
            {choices.description ? <DialogDescription>{choices.description}</DialogDescription> : null}
          </DialogHeader>
          {choices.actions.includes("end") ? (
            // Three choices don't fit on one row in a small dialog: stack them, full width.
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  onLeave();
                }}
              >
                Just leave
              </Button>
              <Button
                variant="destructive-quiet"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  setConfirmEnd(true);
                }}
              >
                End meeting for everyone
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive-quiet"
                onClick={() => {
                  onOpenChange(false);
                  onLeave();
                }}
              >
                {isHost ? "Just leave" : "Leave"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End the meeting for everyone?"
        description="Everyone leaves the call now. Notes (if on) are processed on the Drive."
        confirmLabel="End for everyone"
        onConfirm={endForEveryone}
      />
    </>
  );
}
