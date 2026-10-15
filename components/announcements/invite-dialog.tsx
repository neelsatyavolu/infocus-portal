"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Field, fieldLabelClass } from "@/components/kit/field";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/src/lib/utils";

const INVITE_DURATIONS = [
  { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" }
] as const;

type InviteDuration = (typeof INVITE_DURATIONS)[number]["value"];
type InviteNote = { text: string; tone: "success" | "warning" | "danger" };

function NoteLine({ note }: { note: InviteNote }) {
  if (note.tone === "danger") return <InlineError>{note.text}</InlineError>;
  const Icon = note.tone === "success" ? Check : AlertTriangle;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 text-[13px] leading-snug",
        note.tone === "success" ? "text-[var(--brand-green)]" : "text-[var(--brand-amber)]"
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">{note.text}</span>
    </p>
  );
}

/**
 * Invite people to view submissions without signing in (executive producers). The link, the
 * addresses and the duration stay between openings; opening clears the last message.
 */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [emails, setEmails] = useState("");
  const [busyAction, setBusyAction] = useState<"copy" | "send" | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<InviteNote | null>(null);
  const [duration, setDuration] = useState<InviteDuration>("30d");
  const [wasOpen, setWasOpen] = useState(open);
  const busy = busyAction !== null;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNote(null);
  }

  async function createInvite(sendEmail: boolean) {
    setBusyAction(sendEmail ? "send" : "copy");
    setNote(null);
    try {
      const response = await fetch("/api/announcements/submitted/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, sendEmail, duration })
      });
      const payload = (await response.json()) as {
        data?: { shareUrl?: string; emailed?: number };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data?.shareUrl) {
        throw new Error(payload.error?.message ?? "Could not create invite.");
      }

      setUrl(payload.data.shareUrl);
      if (sendEmail) {
        setNote(
          payload.data.emailed
            ? { text: `Sent ${payload.data.emailed} invite${payload.data.emailed === 1 ? "" : "s"}.`, tone: "success" }
            : { text: "Link created. Email is not configured, so copy the link instead.", tone: "warning" }
        );
      }
      return payload.data.shareUrl;
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : "Could not create invite.", tone: "danger" });
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function copyLink() {
    const created = await createInvite(false);
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setNote({ text: "Link copied.", tone: "success" });
    } catch {
      setNote({ text: "Link created. Copy it from the box above.", tone: "warning" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite people to view submissions</DialogTitle>
          <DialogDescription>Send a link so people can see submitted announcements without signing in.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={fieldLabelClass}>Link lasts</span>
            <SegmentedControl
              ariaLabel="Link lasts"
              value={duration}
              onChange={setDuration}
              options={INVITE_DURATIONS.map((option) => ({ value: option.value, label: option.label }))}
              size="touch"
              fullWidth
              className="pointer-coarse:h-10"
            />
          </div>
          <Field label="Email addresses" htmlFor="invite-emails" hint="Separate with commas or spaces. Only the first 20 are used.">
            <Textarea
              id="invite-emails"
              aria-describedby="invite-emails-hint"
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              rows={4}
              placeholder="name@pausd.org, another@pausd.org"
            />
          </Field>
          {url ? (
            <Field label="Share link" htmlFor="invite-url">
              <Input
                id="invite-url"
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono-broadcast text-base tabular-nums md:text-[13px]"
              />
            </Field>
          ) : null}
          {note ? <NoteLine note={note} /> : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void copyLink()}>
            {busyAction === "copy" ? "Working…" : "Copy link"}
          </Button>
          <Button type="button" disabled={busy || !emails.trim()} onClick={() => void createInvite(true)}>
            {busyAction === "send" ? "Sending…" : "Send invites"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
