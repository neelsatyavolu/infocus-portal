"use client";

import { FormEvent, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";
import {
  formatRoleLabel,
  personLabel,
  type PlatformRole,
  type PlatformUser,
  type ReportMessage,
  type RoleAssignment
} from "./admin-types";

function withoutKey(record: Record<string, string>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

/** Admin → People: the one list of who may sign in. */
export function PeopleSection({
  users,
  roles,
  onChanged,
  onMessage,
  onUserUpdated,
  onUserRemoved
}: {
  users: PlatformUser[];
  roles: RoleAssignment[];
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
  onUserUpdated: (user: PlatformUser) => void;
  onUserRemoved: (userId: string) => void;
}) {
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [addingPerson, setAddingPerson] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlatformUser | null>(null);

  const roleByEmail = useMemo(
    () => new Map<string, PlatformRole>(roles.map((entry) => [entry.email.toLowerCase(), entry.role])),
    [roles]
  );

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        (a.name ?? a.email ?? "").toLowerCase().localeCompare((b.name ?? b.email ?? "").toLowerCase())
      ),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return sortedUsers;
    }
    return sortedUsers.filter((user) =>
      [user.name, user.nickname, user.email].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [query, sortedUsers]);

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) {
      onMessage("Enter a name and email.");
      return;
    }

    setAddingPerson(true);
    onMessage(null);

    try {
      const response = await fetch("/api/platform/allowed-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, sendInvite: sendInviteEmail })
      });
      const payload = await response.json();

      if (!response.ok) {
        const errorMessage = payload?.error?.message ?? "Failed to add person.";
        onMessage(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setInviteName("");
      setInviteEmail("");
      const emailed = Number(payload?.data?.emailed ?? 0);
      toast.success(
        sendInviteEmail
          ? emailed > 0
            ? `${name} can sign in. Invite email sent.`
            : `${name} can sign in. Invite email was not sent.`
          : `${name} can sign in with Google.`
      );
      await onChanged();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add person.";
      onMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setAddingPerson(false);
    }
  }

  async function saveNickname(event: FormEvent, user: PlatformUser) {
    event.preventDefault();
    const draft = drafts[user.id];
    // Enter in an untouched field submits the form too; only save a real change.
    if (draft === undefined || draft.trim() === (user.nickname ?? "")) {
      return;
    }
    setSavingId(user.id);
    onMessage(null);

    const response = await fetch(`/api/platform/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: draft.trim() || null })
    });
    const payload = await response.json();

    if (!response.ok) {
      onMessage(payload?.error?.message ?? "Failed to update nickname.");
      setSavingId(null);
      return;
    }

    onUserUpdated(payload.data as PlatformUser);
    setDrafts((current) => withoutKey(current, user.id));
    setSavingId(null);
    toast.success("Nickname saved.");
  }

  // Throws on failure so the confirm dialog stays open for a retry.
  async function removeUser(user: PlatformUser) {
    setDeletingId(user.id);
    onMessage(null);

    let response: Response;
    try {
      response = await fetch(`/api/platform/users/${user.id}`, { method: "DELETE" });
    } catch {
      const errorMessage = "Couldn't reach the server. Please try again.";
      onMessage(errorMessage);
      toast.error(errorMessage);
      setDeletingId(null);
      throw new Error(errorMessage);
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = payload?.error?.message ?? "Failed to delete user.";
      onMessage(errorMessage);
      toast.error(errorMessage);
      setDeletingId(null);
      throw new Error(errorMessage);
    }

    onUserRemoved(user.id);
    setDrafts((current) => withoutKey(current, user.id));
    setDeletingId(null);
  }

  return (
    <SettingsSection
      id="people"
      title="People"
      description="Everyone who can sign in. Add someone with their name and email; they sign in with that Google account."
    >
      <SettingsPanel>
        <SettingsPanelBody>
          <form onSubmit={addPerson} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              placeholder="Full name"
              autoComplete="name"
              aria-label="Full name"
            />
            <Input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="name@pausd.us"
              autoComplete="email"
              aria-label="Email"
            />
            <Button type="submit" disabled={addingPerson}>
              {addingPerson ? "Adding…" : "Add person"}
            </Button>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground sm:col-span-3">
              <input
                type="checkbox"
                checked={sendInviteEmail}
                onChange={(event) => setSendInviteEmail(event.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Email them an invite to sign in
            </label>
          </form>
        </SettingsPanelBody>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-background/40 px-4 py-2.5 md:px-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            {query.trim() ? `${filteredUsers.length} of ${users.length}` : `${users.length} people`}
          </span>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              className="h-8 pl-8"
            />
          </div>
        </div>

        <ul className="max-h-[560px] divide-y divide-border overflow-auto">
          {filteredUsers.map((user) => {
            const draft = drafts[user.id];
            const nickname = draft ?? user.nickname ?? "";
            const dirty = draft !== undefined && draft.trim() !== (user.nickname ?? "");
            const role = user.email ? roleByEmail.get(user.email.toLowerCase()) : undefined;
            const busy = savingId === user.id || deletingId === user.id;

            return (
              <li key={user.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground"
                  >
                    {personLabel(user).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                      <span className="truncate">{personLabel(user)}</span>
                      {role ? (
                        <span className="rounded-sm border border-border bg-secondary px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
                          {formatRoleLabel(role)}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {user.email ?? "No email"}
                      {user.name && user.name !== personLabel(user) ? ` · Google: ${user.name}` : ""}
                      {` · added ${new Date(user.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>

                <form onSubmit={(event) => void saveNickname(event, user)} className="flex shrink-0 items-center gap-2 pl-11 md:pl-0">
                  <Input
                    value={nickname}
                    onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                    placeholder="Nickname"
                    aria-label={`Nickname for ${personLabel(user)}`}
                    disabled={busy}
                    className="h-8 w-full md:w-44"
                  />
                  {dirty ? (
                    <Button type="submit" size="sm" disabled={busy}>
                      {savingId === user.id ? "Saving…" : "Save"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive-quiet"
                    size="sm"
                    onClick={() => setPendingDelete(user)}
                    disabled={busy}
                    aria-label={`Remove ${personLabel(user)}`}
                    title="Remove"
                  >
                    <Trash2 />
                    <span className="sr-only md:not-sr-only">{deletingId === user.id ? "Removing…" : "Remove"}</span>
                  </Button>
                </form>
              </li>
            );
          })}
          {filteredUsers.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">
              {users.length === 0 ? "No people yet. Add someone above." : "No people match that search."}
            </li>
          ) : null}
        </ul>
      </SettingsPanel>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.email ?? pendingDelete?.name ?? "this user"}?`}
        description="This removes their registered user profile from this platform."
        confirmLabel="Delete"
        onConfirm={() => (pendingDelete ? removeUser(pendingDelete) : undefined)}
      />
    </SettingsSection>
  );
}
