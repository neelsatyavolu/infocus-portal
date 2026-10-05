"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { CopyTextButton } from "@/components/copy-text-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MeetingRoomSettings } from "@/src/lib/meetings/protocol";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { ConfirmDialog } from "../confirm-dialog";
import { InviteesDialog } from "../invitees-dialog";
import { AudioSettings, VideoSettings } from "./settings-sections";
import { accessTagLabel } from "../tab/meeting-rows";
import { meetingUrl } from "@/src/lib/meetings/links";
import type { LocalMedia } from "./use-local-media";

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function MeetingInfoDialog({ open, onOpenChange, meeting, isHost }: OpenProps & { meeting: MeetingSummary; isHost: boolean }) {
  const [editInvitees, setEditInvitees] = useState(false);
  const link = meetingUrl(meeting.id);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Grid items default to min-width:auto; without min-w-0 the long link widens the dialog past its edge. */}
        <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{meeting.title}</DialogTitle>
            <DialogDescription>Share this link with producers. People who aren&rsquo;t hosts may need to be let in.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--ink-text)]">{link}</span>
            <CopyTextButton text={link} label="Copy link" />
          </div>
          {accessTagLabel(meeting) ? <p className="text-sm text-muted-foreground">{accessTagLabel(meeting)}</p> : null}
          {isHost && meeting.canEdit && meeting.access !== "EXECS_ONLY" ? (
            <Button variant="outline" onClick={() => setEditInvitees(true)}>
              Edit invited people
            </Button>
          ) : null}
          <p className="flex items-start gap-2 bg-[var(--ink-3)] px-3 py-2 text-xs text-[var(--ink-text)]">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Encrypted. Audio, video, screen and chat are encrypted on each device. Cloudflare only relays scrambled data.
          </p>
        </DialogContent>
      </Dialog>
      <InviteesDialog open={editInvitees} onOpenChange={setEditInvitees} meetingId={meeting.id} access={meeting.access} />
    </>
  );
}

export function DevicesDialog({
  open,
  onOpenChange,
  media,
  peopleCount
}: OpenProps & { media: LocalMedia; peopleCount: number }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-h-[85dvh] max-w-md overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Audio and video</DialogTitle>
        </DialogHeader>
        <AudioSettings media={media} />
        <div className="h-px bg-[var(--ink-4)]" aria-hidden />
        <VideoSettings media={media} peopleCount={peopleCount} />
      </DialogContent>
    </Dialog>
  );
}

export function HostControlsDialog({
  open,
  onOpenChange,
  meetingId,
  settings
}: OpenProps & { meetingId: string; settings: MeetingRoomSettings }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pending, setPending] = useState<keyof MeetingRoomSettings | null>(null);

  async function toggle(key: keyof MeetingRoomSettings, value: boolean) {
    setPending(key);
    try {
      await meetingsApi.patch(meetingId, { [key]: value });
      toast.success(
        key === "quickAccess"
          ? value
            ? "Producers can now join without asking."
            : "Producers now ask to join."
          : value
            ? "Notes are on."
            : "Notes are off."
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

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
        <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Host controls</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="host-quick-access">Quick access</Label>
                <p className="text-xs text-muted-foreground">Producers join without asking a host.</p>
              </div>
              <Switch
                id="host-quick-access"
                checked={settings.quickAccess}
                disabled={pending !== null}
                onCheckedChange={(value) => void toggle("quickAccess", value)}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="host-notes">Notes</Label>
                <p className="text-xs text-muted-foreground">The Drive transcribes and summarizes this meeting.</p>
              </div>
              <Switch
                id="host-notes"
                checked={settings.notesEnabled}
                disabled={pending !== null}
                onCheckedChange={(value) => void toggle("notesEnabled", value)}
              />
            </div>
            <Button variant="destructive-quiet" className="w-full" onClick={() => setConfirmEnd(true)}>
              End meeting for everyone
            </Button>
          </div>
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
