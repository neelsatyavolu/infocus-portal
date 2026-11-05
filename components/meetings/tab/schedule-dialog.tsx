"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MeetingAccessValue, MeetingSummary } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { formatDuration, isoToPacificWallTime, pacificWallTimeToIso } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { PeoplePicker, useMeetingPeople } from "../people-picker";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const TITLE_MAX = 120;
/** Every field and button in the dialog: 40px touch targets on phones, 36px from md. */
const TOUCH = "max-md:h-10";

function defaultStart() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return isoToPacificWallTime(next.toISOString());
}

/** "Who can join" choices; the restricted ones are for execs only. */
export function accessOptions(canCreateRestricted: boolean): Array<[MeetingAccessValue, string]> {
  return canCreateRestricted
    ? [
        ["OPEN", "All producers"],
        ["EXECS_ONLY", "Execs only"],
        ["INVITE_ONLY", "Only people I choose"]
      ]
    : [["OPEN", "All producers"]];
}

/**
 * "Who can join" as equal segments on real radio inputs (arrow keys move between them), the same
 * height as the fields above (40px on phones, 36px from md), stacked on phones.
 */
function AccessChoice({
  options,
  value,
  onChange,
  lockedNote
}: {
  options: Array<[MeetingAccessValue, string]>;
  value: MeetingAccessValue;
  onChange: (value: MeetingAccessValue) => void;
  /** Execs see that this can't be changed later. */
  lockedNote: boolean;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-foreground">Who can join</legend>
      <div className="grid grid-cols-1 gap-2 sm:auto-cols-fr sm:grid-flow-col">
        {options.map(([option, label]) => {
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                "flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-md border px-3 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring md:h-9",
                checked
                  ? "border-[var(--brand-green)] bg-[var(--brand-green)]/10 font-medium text-foreground"
                  : "border-input text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
              )}
            >
              <input
                type="radio"
                name="meeting-access"
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              <span className="truncate">{label}</span>
            </label>
          );
        })}
      </div>
      {value === "EXECS_ONLY" ? (
        <p className="text-xs text-muted-foreground">
          Executive producers, the adviser and super admin. Nobody else can see this meeting or its notes.
        </p>
      ) : null}
      {lockedNote ? <p className="text-xs text-muted-foreground">Who can join can&rsquo;t be changed later.</p> : null}
    </fieldset>
  );
}

/**
 * "schedule": title, Pacific date and time, duration, who can join.
 * "private-now": an invite-only meeting that starts now (execs).
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  mode,
  canCreateInviteOnly,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "schedule" | "private-now";
  canCreateInviteOnly: boolean;
  onCreated: (meeting: MeetingSummary) => void;
}) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(defaultStart);
  const [duration, setDuration] = useState("60");
  const [access, setAccess] = useState<MeetingAccessValue>("OPEN");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inviteOnly = mode === "private-now" || access === "INVITE_ONLY";
  const { people, error } = useMeetingPeople(open && inviteOnly);

  // Reset the form each time it opens (or switches mode while open).
  const [prev, setPrev] = useState({ open: false, mode });
  if (prev.open !== open || prev.mode !== mode) {
    setPrev({ open, mode });
    if (open) {
      setTitle(mode === "private-now" ? "Private meeting" : "");
      setWhen(defaultStart());
      setDuration("60");
      setAccess(mode === "private-now" ? "INVITE_ONLY" : "OPEN");
      setInvitees([]);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Give the meeting a title.");
      return;
    }
    const startsAt = mode === "private-now" ? undefined : pacificWallTimeToIso(when);
    if (mode === "schedule" && !startsAt) {
      toast.error("Pick a date and time.");
      return;
    }
    if (inviteOnly && invitees.length === 0) {
      toast.error("Choose at least one person.");
      return;
    }
    setSaving(true);
    try {
      const { meeting } = await meetingsApi.create({
        title: cleanTitle,
        startsAt: startsAt ?? undefined,
        durationMinutes: Number(duration),
        access: inviteOnly ? "INVITE_ONLY" : access,
        inviteeUserIds: inviteOnly ? invitees : undefined
      });
      onOpenChange(false);
      onCreated(meeting);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create the meeting."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-w-xl [&>*]:min-w-0">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "private-now" ? "Start a private meeting" : "Schedule a meeting"}</DialogTitle>
            <DialogDescription>
              {mode === "private-now" ? "Only the people you choose can join." : "Times are Pacific."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input id="meeting-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Rundown check" required className={TOUCH} />
          </div>

          {mode === "schedule" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="meeting-when">Date and time (Pacific)</Label>
                <Input id="meeting-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className={TOUCH} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-duration">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="meeting-duration" className={cn("focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]", TOUCH)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {formatDuration(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {mode === "schedule" ? (
            <AccessChoice options={accessOptions(canCreateInviteOnly)} value={access} onChange={setAccess} lockedNote={canCreateInviteOnly} />
          ) : null}

          {inviteOnly ? <PeoplePicker people={people} error={error} selected={invitees} onChange={setInvitees} /> : null}

          {/* Pinned to the bottom of the dialog's scroll, so the actions stay in reach on phones. */}
          <DialogFooter sticky>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className={TOUCH}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className={TOUCH}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {mode === "private-now" ? "Start meeting" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
