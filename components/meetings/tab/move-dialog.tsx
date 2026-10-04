"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { isoToPacificWallTime, pacificWallTimeToIso } from "@/src/lib/meetings/client/time";

export function MoveDialog({
  meeting,
  onOpenChange,
  onMoved
}: {
  meeting: MeetingSummary | null;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meeting) setWhen(isoToPacificWallTime(meeting.startsAt));
  }, [meeting]);

  async function save() {
    if (!meeting) return;
    const startsAt = pacificWallTimeToIso(when);
    if (!startsAt) {
      toast.error("Pick a date and time.");
      return;
    }
    setSaving(true);
    try {
      await meetingsApi.patch(meeting.id, { startsAt });
      toast.success("Meeting moved.");
      onOpenChange(false);
      onMoved();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't move the meeting."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={meeting !== null} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-w-sm [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Move meeting</DialogTitle>
          <DialogDescription>{meeting?.title}. Times are Pacific.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="move-when">New date and time</Label>
          <Input id="move-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
