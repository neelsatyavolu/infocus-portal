"use client";

import { useEffect, useState, type FormEvent } from "react";
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

function defaultStart() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return isoToPacificWallTime(next.toISOString());
}

/**
 * "schedule": title, Pacific date and time, duration, who can join.
 * "private-now": an invite-only meeting that starts now (execs).
 */
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

  useEffect(() => {
    if (!open) return;
    setTitle(mode === "private-now" ? "Private meeting" : "");
    setWhen(defaultStart());
    setDuration("60");
    setAccess(mode === "private-now" ? "INVITE_ONLY" : "OPEN");
    setInvitees([]);
  }, [open, mode]);

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
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "private-now" ? "Start a private meeting" : "Schedule a meeting"}</DialogTitle>
            <DialogDescription>
              {mode === "private-now" ? "Only the people you choose can join." : "Times are Pacific."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input id="meeting-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Rundown check" required />
          </div>

          {mode === "schedule" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="meeting-when">Date and time (Pacific)</Label>
                <Input id="meeting-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-duration">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="meeting-duration">
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
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Who can join</legend>
              {/* Equal-width segments in one row; a single column on narrow screens. */}
              <div className="grid grid-cols-1 gap-2 sm:auto-cols-fr sm:grid-flow-col" role="radiogroup" aria-label="Who can join">
                {accessOptions(canCreateInviteOnly).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={access === value}
                    onClick={() => setAccess(value)}
                    className={cn(
                      "flex min-h-10 items-center justify-center rounded-md border px-3 py-2 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
                      access === value ? "border-[var(--brand-green)] bg-[var(--brand-green)]/10 text-foreground" : "border-input text-muted-foreground hover:bg-[var(--ink-3)]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {access === "EXECS_ONLY" ? (
                <p className="text-xs text-muted-foreground">
                  Executive producers, the adviser and super admin. Nobody else can see this meeting or its notes.
                </p>
              ) : null}
              {canCreateInviteOnly ? <p className="text-xs text-muted-foreground">Who can join can&rsquo;t be changed later.</p> : null}
            </fieldset>
          ) : null}

          {inviteOnly ? <PeoplePicker people={people} error={error} selected={invitees} onChange={setInvitees} /> : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {mode === "private-now" ? "Start meeting" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
