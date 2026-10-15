"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
import { ListSkeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { MeetingInviteEmailView, MeetingInviteListResponse, MeetingPerson } from "@/src/lib/meetings/types";
import { useMeetingPeople } from "../people-picker";
import { LinkedPersonSelect } from "./linked-person-select";
import { AddInviteForm, INVITES_SECTION_HEADING, type NewInvite } from "./invite-add-form";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { pacificDayLabel } from "@/src/lib/meetings/client/time";
import { ConfirmDialog } from "../confirm-dialog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `userId` links the address to a producer (backend adds it to the invite view). */
type InviteRow = MeetingInviteEmailView & { userId?: string | null };

export function isValidInviteEmail(value: string) {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** Whether Google Calendar is sending invites, as one Alert line. */
function CalendarStatus({ calendar, canManage }: { calendar: MeetingInviteListResponse["calendar"]; canManage: boolean }) {
  if (calendar.connected) {
    const sentFrom = `Invites are sent from ${calendar.accountEmail} via Google Calendar.`;
    return calendar.lastSyncError ? (
      <Alert tone="danger" compact>
        {sentFrom} Last sync failed: {calendar.lastSyncError}
      </Alert>
    ) : (
      <Alert tone="neutral" icon={Check} compact>
        {sentFrom}
      </Alert>
    );
  }
  return canManage ? (
    <Alert tone="warning" compact>
      Connect Google Calendar in Admin to send invites.
    </Alert>
  ) : (
    <Alert tone="neutral" compact>
      Calendar invites are off for now.
    </Alert>
  );
}

/** Managers' list: who, then the linked producer and Remove, on one grid so rows line up. */
function InviteList({
  invites,
  people,
  linking,
  onLink,
  onRemove
}: {
  invites: InviteRow[];
  people: MeetingPerson[] | null;
  linking: string | null;
  onLink: (invite: InviteRow, userId: string | null) => void;
  onRemove: (invite: InviteRow) => void;
}) {
  if (invites.length === 0) {
    return <p className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">No addresses yet.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_12rem_2.25rem]"
        >
          <div className="col-span-2 min-w-0 md:col-span-1">
            <p className="truncate text-sm text-foreground">{invite.name ?? invite.email}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              {invite.name ? <span className="min-w-0 truncate">{invite.email} ·</span> : null}
              {invite.lastInvitedAt ? (
                <span>Invited {pacificDayLabel(invite.lastInvitedAt)}</span>
              ) : (
                <StatusTag tone="warning" size="sm">
                  Not sent yet
                </StatusTag>
              )}
            </div>
          </div>
          <LinkedPersonSelect
            people={people}
            value={invite.userId ?? null}
            onChange={(userId) => onLink(invite, userId)}
            disabled={linking === invite.id}
            label={`Producer linked to ${invite.email}`}
            className="h-10 md:h-9"
          />
          <Button
            size="icon"
            variant="destructive-quiet"
            onClick={() => onRemove(invite)}
            aria-label={`Remove ${invite.email}`}
            className="h-10 w-10 md:h-9 md:w-9"
          >
            <Trash2 aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Calendar invites sheet's body (Google Calendar invites for scheduled meetings; the sheet
 * supplies the title and what invites do): whether they're being sent, the invited addresses,
 * and for execs the tools to sync, link, remove and add. Other producers see the status and the
 * count.
 */
export function InvitesPanel() {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [calendar, setCalendar] = useState<MeetingInviteListResponse["calendar"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"add" | "resend" | null>(null);
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

  /** True when the address was added (the form then clears). */
  async function add({ email, name, userId }: NewInvite) {
    const clean = email.trim().toLowerCase();
    if (!isValidInviteEmail(clean)) {
      toast.error("Enter a valid email address.");
      return false;
    }
    setBusy("add");
    try {
      await meetingsApi.addInvite({ email: clean, name: name.trim() || undefined, userId: userId ?? undefined });
      toast.success(`Added ${clean}.`);
      await load();
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add that address."));
      return false;
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
    <div className="space-y-5">
      {calendar ? <CalendarStatus calendar={calendar} canManage={canManage} /> : null}

      {loadError ? (
        <Alert tone="danger" compact>
          {loadError}
        </Alert>
      ) : null}
      {!invites && !loadError ? <ListSkeleton rows={3} leading={false} /> : null}

      {invites && canManage ? (
        <section aria-labelledby="invites-list-title" className="space-y-3">
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
            <h3 id="invites-list-title" className={INVITES_SECTION_HEADING}>
              Invited addresses
              <span className="font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{invites.length}</span>
            </h3>
            {invites.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => void resendAll()} disabled={busy !== null} className="h-10 md:h-8">
                {busy === "resend" ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
                Sync now
              </Button>
            ) : null}
          </div>
          <InviteList invites={invites} people={people} linking={linking} onLink={(invite, userId) => void link(invite, userId)} onRemove={setRemoving} />
        </section>
      ) : null}
      {/* Everyone else sees how many addresses get invites, as one fact line. */}
      {invites && !canManage ? (
        <KeyValueList dense labelWidth="9rem" items={[{ label: "Invited addresses", value: invites.length, mono: true }]} />
      ) : null}

      {canManage && invites ? <AddInviteForm people={people} busy={busy} onAdd={add} /> : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.email ?? ""}?`}
        description="They get a cancellation for the InFocus Producer Meeting."
        confirmLabel="Remove"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </div>
  );
}
