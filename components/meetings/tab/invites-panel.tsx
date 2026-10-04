"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MeetingInviteEmailView } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { pacificDayLabel } from "@/src/lib/meetings/client/time";
import { ConfirmDialog } from "../confirm-dialog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidInviteEmail(value: string) {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** Calendar invites for the recurring Producer meeting. Execs manage; other producers see the count. */
export function InvitesPanel() {
  const [invites, setInvites] = useState<MeetingInviteEmailView[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"add" | "resend" | null>(null);
  const [removing, setRemoving] = useState<MeetingInviteEmailView | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await meetingsApi.invites();
      setInvites(data.invites);
      setCanManage(data.canManage);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, "Couldn't load calendar invites."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!isValidInviteEmail(clean)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy("add");
    try {
      await meetingsApi.addInvite({ email: clean, name: name.trim() || undefined });
      toast.success(`Invite sent to ${clean}.`);
      setEmail("");
      setName("");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add that address."));
    } finally {
      setBusy(null);
    }
  }

  async function resendAll() {
    setBusy("resend");
    try {
      await meetingsApi.resendInvites();
      toast.success("Invites are being sent. This can take a minute.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't resend invites."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(invite: MeetingInviteEmailView) {
    try {
      await meetingsApi.removeInvite(invite.id);
      toast.success(`Removed ${invite.email}. They get a cancellation.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove that address."));
      throw err;
    }
  }

  return (
    <section aria-labelledby="invites-heading" className="space-y-3 rounded-md border border-[var(--ink-4)] bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="invites-heading" className="text-base font-semibold text-foreground">
          Calendar invites
          {invites ? <span className="ml-2 font-mono text-sm tabular-nums text-muted-foreground">{invites.length}</span> : null}
        </h2>
        {canManage && invites && invites.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => void resendAll()} disabled={busy !== null}>
            {busy === "resend" ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
            Resend to everyone
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Each address gets a repeating calendar invite (Sun, Mon, Wed 9:15 PM) with the permanent link. Moving or cancelling a
        meeting sends an update.
      </p>
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}
      {!invites && !loadError ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /> : null}

      {canManage && invites ? (
        <>
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.edu" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input id="invite-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy !== null}>
              {busy === "add" ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Add and invite
            </Button>
          </form>
          <ul className="divide-y divide-[var(--ink-4)] rounded-md border border-[var(--ink-4)]">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{invite.name ?? invite.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.name ? `${invite.email} · ` : ""}
                    {invite.lastInvitedAt ? `Invited ${pacificDayLabel(invite.lastInvitedAt)}` : "Not sent yet"}
                  </p>
                </div>
                <Button size="sm" variant="destructive-quiet" onClick={() => setRemoving(invite)} aria-label={`Remove ${invite.email}`}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
            {invites.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No addresses yet.</li> : null}
          </ul>
        </>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.email ?? ""}?`}
        description="They get a cancellation for the repeating producer meeting."
        confirmLabel="Remove"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </section>
  );
}
