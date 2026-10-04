"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MeetingInviteEmailView, MeetingInviteListResponse } from "@/src/lib/meetings/types";
import { useMeetingPeople } from "../people-picker";
import { LinkedPersonSelect } from "./linked-person-select";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { pacificDayLabel } from "@/src/lib/meetings/client/time";
import { ConfirmDialog } from "../confirm-dialog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `userId` links the address to a producer (backend adds it to the invite view). */
type InviteRow = MeetingInviteEmailView & { userId?: string | null };

export function isValidInviteEmail(value: string) {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** Calendar invites for the InFocus Producer Meeting. Execs manage; other producers see the count. */
/** `embedded`: shown inside the Meetings calendar settings dialog, which supplies the frame and title. */
export function InvitesPanel({ embedded = false }: { embedded?: boolean }) {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [calendar, setCalendar] = useState<MeetingInviteListResponse["calendar"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"add" | "resend" | null>(null);
  const [linkUserId, setLinkUserId] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InviteRow | null>(null);
  const { people } = useMeetingPeople(canManage);

  const load = useCallback(async () => {
    try {
      const data = await meetingsApi.invites();
      setInvites(data.invites);
      setCanManage(data.canManage);
      setCalendar(data.calendar);
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
      await meetingsApi.addInvite({ email: clean, name: name.trim() || undefined, userId: linkUserId ?? undefined });
      toast.success(`Added ${clean}.`);
      setEmail("");
      setName("");
      setLinkUserId(null);
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
      toast.success("Syncing with Google Calendar. This can take a minute.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't start a sync."));
    } finally {
      setBusy(null);
    }
  }

  async function link(invite: InviteRow, userId: string | null) {
    setLinking(invite.id);
    try {
      await meetingsApi.linkInvite(invite.id, userId);
      setInvites((prev) => prev?.map((row) => (row.id === invite.id ? { ...row, userId } : row)) ?? prev);
      toast.success(userId ? "Linked to a producer." : "Unlinked.");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update that address."));
    } finally {
      setLinking(null);
    }
  }

  async function remove(invite: InviteRow) {
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
    <section
      aria-label="Calendar invites"
      className={embedded ? "space-y-3" : "space-y-3 rounded-md border border-[var(--ink-4)] bg-card p-4"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={embedded ? "text-sm font-medium text-muted-foreground" : "text-base font-semibold text-foreground"}>
          {embedded ? "Invited addresses" : "Calendar invites"}
          {invites ? <span className="ml-2 font-mono text-sm tabular-nums text-muted-foreground">{invites.length}</span> : null}
        </h2>
        {canManage && invites && invites.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => void resendAll()} disabled={busy !== null}>
            {busy === "resend" ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
            Sync now
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Invites go out automatically for every scheduled meeting. Private meetings only go to linked people. Moves and
        cancellations update calendars automatically.
      </p>
      {calendar ? (
        <p className={calendar.connected && !calendar.lastSyncError ? "text-sm text-muted-foreground" : "text-sm text-danger"}>
          {calendar.connected
            ? `Invites are sent from ${calendar.accountEmail} via Google Calendar.`
            : canManage
              ? "Connect Google Calendar in Admin to send invites."
              : "Calendar invites are off for now."}
          {calendar.connected && calendar.lastSyncError ? ` Last sync failed: ${calendar.lastSyncError}` : null}
        </p>
      ) : null}
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}
      {!invites && !loadError ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /> : null}

      {canManage && invites ? (
        <>
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.edu" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input id="invite-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Producer (optional)</Label>
              <LinkedPersonSelect people={people} value={linkUserId} onChange={setLinkUserId} label="Link to a producer" />
            </div>
            <Button type="submit" disabled={busy !== null}>
              {busy === "add" ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Add and invite
            </Button>
          </form>
          <ul className="divide-y divide-[var(--ink-4)] rounded-md border border-[var(--ink-4)]">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{invite.name ?? invite.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.name ? `${invite.email} · ` : ""}
                    {invite.lastInvitedAt ? `Invited ${pacificDayLabel(invite.lastInvitedAt)}` : "Not sent yet"}
                  </p>
                </div>
                <LinkedPersonSelect
                  people={people}
                  value={invite.userId ?? null}
                  onChange={(userId) => void link(invite, userId)}
                  disabled={linking === invite.id}
                  label={`Producer linked to ${invite.email}`}
                />
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
        description="They get a cancellation for the InFocus Producer Meeting."
        confirmLabel="Remove"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </section>
  );
}
