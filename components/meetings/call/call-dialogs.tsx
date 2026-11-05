"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useRef, useState } from "react";
import { Lock, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
import { StatusTag } from "@/components/kit/status-tag";
import { CopyTextButton } from "@/components/copy-text-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MeetingRoomSettings } from "@/src/lib/meetings/protocol";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { ConfirmDialog } from "../confirm-dialog";
import { InviteesDialog } from "../invitees-dialog";
import { HostSettingsSection } from "./host-settings";
import { AudioSettings, VideoSettings } from "./settings-sections";
import { accessTagLabel } from "../tab/meeting-rows";
import { meetingUrl } from "@/src/lib/meetings/links";
import { debugInfo } from "@/src/lib/meetings/client/diagnostics";
import type { LocalMedia } from "./use-local-media";
import { cn } from "@/src/lib/utils";

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Copies the call's recent diagnostics (ids, states, counters; no names or content) for a bug report. */
function CopyDebugInfoButton({ meetingId, uid }: { meetingId: string; uid: string | null }) {
  async function copy() {
    try {
      const build = process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) || null;
      await navigator.clipboard.writeText(debugInfo({ meetingId, uid, userAgent: navigator.userAgent, build }));
      toast.success("Debug info copied. Paste it in your message to us.");
    } catch {
      toast.error("Couldn't copy the debug info.");
    }
  }
  return (
    <Button variant="ghost" className="text-muted-foreground" onClick={() => void copy()}>
      Copy debug info
    </Button>
  );
}

function AccessValue({ meeting }: { meeting: MeetingSummary }) {
  const label = accessTagLabel(meeting);
  if (!label) return <StatusTag icon={Users}>All producers</StatusTag>;
  return <StatusTag icon={meeting.access === "EXECS_ONLY" ? ShieldCheck : Lock}>{label}</StatusTag>;
}

/** The link as a read-only field with Copy beside it: two 36px controls on one line. */
function LinkField({ link }: { link: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="block h-9 min-w-0 flex-1 truncate rounded-md border border-input px-3 font-mono text-xs leading-[2.125rem] text-[var(--ink-text)]">
        {link}
      </span>
      {/* Only the props CopyTextButton has always had; the class makes it the outline h-9 button. */}
      <CopyTextButton text={link} label="Copy link" className={cn(buttonVariants({ variant: "outline" }), "min-h-0 active:scale-100")} />
    </div>
  );
}

/**
 * Meeting details: the link, who can join, host settings (hosts only, read live from the room)
 * and the privacy note. Opened from the title in the status bar or More ("info"), or straight to
 * the host section ("host"). With no meeting summary yet, it is just the host settings.
 */
export function MeetingDialog({
  open,
  onOpenChange,
  focus,
  meetingId,
  meeting,
  isHost,
  settings,
  selfUid
}: OpenProps & {
  focus: "info" | "host";
  meetingId: string;
  meeting: MeetingSummary | undefined;
  /** The room's live host flag (host can be handed over mid-call). */
  isHost: boolean;
  settings: MeetingRoomSettings;
  selfUid: string | null;
}) {
  const [editInvitees, setEditInvitees] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const hostRef = useRef<HTMLElement>(null);
  const canEditInvitees = Boolean(meeting && isHost && meeting.canEdit && meeting.access !== "EXECS_ONLY");

  function onOpenAutoFocus(event: Event) {
    const host = hostRef.current;
    if (focus === "host" && host) {
      event.preventDefault();
      host.focus({ preventScroll: true });
      host.scrollIntoView({ block: "start" });
      return;
    }
    pointerSafeAutoFocus(event);
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
        {/* Grid items default to min-width:auto; without min-w-0 the long link widens the dialog past its edge. */}
        <DialogContent onOpenAutoFocus={onOpenAutoFocus} className="max-w-lg gap-5 outline-none [&>*]:min-w-0">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{meeting?.title ?? (isHost ? "Host settings" : "Meeting")}</DialogTitle>
            {meeting ? (
              <DialogDescription>Share this link with producers. People who aren&rsquo;t hosts may need to be let in.</DialogDescription>
            ) : null}
          </DialogHeader>
          {meeting ? (
            <KeyValueList
              labelWidth="7rem"
              className="border-y border-border"
              items={[
                { key: "link", label: "Link", value: <LinkField link={meetingUrl(meeting.id)} /> },
                {
                  key: "access",
                  label: "Who can join",
                  value: <AccessValue meeting={meeting} />,
                  trailing: canEditInvitees ? (
                    <Button variant="outline" onClick={() => setEditInvitees(true)}>
                      Edit invited people
                    </Button>
                  ) : undefined
                }
              ]}
            />
          ) : null}
          {isHost ? (
            <HostSettingsSection ref={hostRef} meetingId={meetingId} settings={settings} onEnd={() => setConfirmEnd(true)} />
          ) : null}
          <Alert tone="neutral" icon={Lock} compact role="note">
            Encrypted. Audio, video, screen and chat are encrypted on each device. Cloudflare only relays scrambled data.
          </Alert>
          <div className="-mt-1 flex justify-start">
            <CopyDebugInfoButton meetingId={meetingId} uid={selfUid} />
          </div>
        </DialogContent>
      </Dialog>
      {meeting ? <InviteesDialog open={editInvitees} onOpenChange={setEditInvitees} meetingId={meeting.id} access={meeting.access} /> : null}
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

/** Audio | Video side by side from 768px; one scrolling column with sticky labels on phones. */
export function DevicesDialog({
  open,
  onOpenChange,
  media,
  peopleCount
}: OpenProps & { media: LocalMedia; peopleCount: number }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={pointerSafeAutoFocus}
        className="max-h-[85dvh] max-w-3xl overflow-y-auto outline-none [&>*]:min-w-0"
      >
        <DialogHeader className="text-left">
          <DialogTitle>Audio and video</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 max-md:[&_section>h3]:sticky max-md:[&_section>h3]:top-0 max-md:[&_section>h3]:z-10 max-md:[&_section>h3]:bg-card max-md:[&_section>h3]:py-2 md:grid-cols-2 md:gap-8 [&>*]:min-w-0">
          <AudioSettings media={media} />
          <VideoSettings media={media} peopleCount={peopleCount} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
