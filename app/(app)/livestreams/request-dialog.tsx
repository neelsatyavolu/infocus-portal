"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { Field, fieldClass } from "@/components/kit/field";
import { KeyValueList } from "@/components/kit/key-value";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arrivalLabel, formatDay, formatTime, type EventRow } from "./livestreams-model";
import { errorMessage } from "./use-livestreams-data";

/**
 * Ask for a slot on one livestream, with an optional note. The note draft is kept per event by
 * the page, so closing and reopening keeps it. Errors stay in the dialog. The page mounts a fresh
 * dialog for each opening (so no old error carries over) and keeps `event` while it closes, so the
 * content doesn't vanish during the exit animation.
 */
export function RequestDialog({
  event,
  open,
  note,
  onNoteChange,
  onClose,
  onSubmit
}: {
  event: EventRow;
  open: boolean;
  note: string;
  onNoteChange: (eventId: string, note: string) => void;
  onClose: () => void;
  onSubmit: (event: EventRow, note: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(event, note);
      toast.success("Request sent");
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Signup failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <form onSubmit={(e) => void submit(e)} className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>Request a slot</DialogTitle>
            <DialogDescription>Managers approve requests and the schedule updates.</DialogDescription>
          </DialogHeader>
          <KeyValueList
            dense
            labelWidth="6.5rem"
            className="rounded-md border border-border px-3"
            items={[
              { label: "Livestream", value: event.title },
              {
                label: "When",
                value: `${formatDay(event.startsAt)} · ${arrivalLabel(event)} · Starts ${formatTime(event.startsAt)}`
              },
              { label: "Location", value: event.location || "TBD" },
              {
                label: "Crew",
                value: `${event.attendeeCount}/${event.capacity} · ${event.openSlots} open`,
                mono: true
              }
            ]}
          />
          <Field label="Note (optional)" htmlFor="livestream-request-note">
            <input
              id="livestream-request-note"
              className={fieldClass}
              maxLength={500}
              placeholder="Anything the manager should know"
              value={note}
              onChange={(e) => onNoteChange(event.id, e.target.value)}
            />
          </Field>
          {error ? (
            <Alert tone="danger" compact>
              {error}
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="max-sm:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? <Spinner /> : null}
              Request sign-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
