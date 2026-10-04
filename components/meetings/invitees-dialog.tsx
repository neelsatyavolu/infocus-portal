"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { MeetingAccessValue } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { PeoplePicker, useMeetingPeople } from "./people-picker";

/** Host edit of a meeting's invite list (PATCH inviteeUserIds). */
export function InviteesDialog({
  open,
  onOpenChange,
  meetingId,
  access,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  access: MeetingAccessValue;
  onSaved?: () => void;
}) {
  const { people, error } = useMeetingPeople(open);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    meetingsApi
      .get(meetingId)
      .then(({ meeting }) => !cancelled && setSelected(meeting.invitees.map((p) => p.id)))
      .catch((err) => {
        if (cancelled) return;
        toast.error(errorMessage(err, "Couldn't load the invite list."));
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, meetingId, onOpenChange]);

  const inviteOnly = access === "INVITE_ONLY";

  async function save() {
    if (!selected) return;
    if (inviteOnly && selected.length === 0) {
      toast.error("Choose at least one person.");
      return;
    }
    setSaving(true);
    try {
      await meetingsApi.patch(meetingId, { inviteeUserIds: selected });
      toast.success("Invite list saved.");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the invite list."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invited people</DialogTitle>
          <DialogDescription>
            {inviteOnly
              ? "Only these producers (and you) can join this meeting."
              : "These producers get the start notification. Leave empty to notify every producer."}
          </DialogDescription>
        </DialogHeader>
        {selected ? (
          <PeoplePicker people={people} error={error} selected={selected} onChange={setSelected} />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!selected || saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
