"use client";

import { useId, useMemo, useState } from "react";
import { SearchX, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/kit/avatar";
import { DisclosureToggle } from "@/components/kit/disclosure";
import { EmptyState } from "@/components/kit/empty-state";
import { PanelHeader } from "@/components/kit/panel";
import { SearchField } from "@/components/kit/search-field";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS, ROW_ACTION_CLASS, RemoveButton } from "./admin-ui";
import {
  errorText,
  formatRoleLabel,
  personLabel,
  type PlatformRole,
  type PlatformUser,
  type ReportMessage,
  type RoleAssignment
} from "./admin-types";
import { NicknameField } from "./nickname-field";

/** Phones show this many matches, then "Show N more" (search always covers everyone). */
const PHONE_VISIBLE = 25;

/**
 * Avatar | person | nickname | remove. Phones: avatar | person | remove, with the nickname on a
 * second line under the name, so nothing floats on an indent.
 */
const ROW_GRID = "grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-2 sm:grid-cols-[2rem_minmax(0,1fr)_13rem_2.25rem]";

function withoutKey(record: Record<string, string>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

function addedOn(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Admin → People: the one list of who may sign in, with nicknames and Remove. */
export function PeopleSection({
  users,
  roles,
  active,
  onMessage,
  onUserUpdated,
  onUserRemoved
}: {
  users: PlatformUser[];
  roles: RoleAssignment[];
  /** The People view is showing ("/" focuses search only then). */
  active: boolean;
  onMessage: ReportMessage;
  onUserUpdated: (user: PlatformUser) => void;
  onUserRemoved: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlatformUser | null>(null);
  const [showAllOnPhone, setShowAllOnPhone] = useState(false);
  const listId = useId();

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

  async function saveNickname(user: PlatformUser) {
    const draft = drafts[user.id];
    // Enter in an untouched field submits the form too; only save a real change.
    if (draft === undefined || draft.trim() === (user.nickname ?? "")) {
      return;
    }
    setSavingId(user.id);
    onMessage(null);

    try {
      const response = await fetch(`/api/platform/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: draft.trim() || null })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to update nickname.");
      }

      onUserUpdated(payload.data as PlatformUser);
      setDrafts((current) => withoutKey(current, user.id));
      toast.success("Nickname saved.");
    } catch (error) {
      const errorMessage = errorText(error, "Failed to update nickname.");
      onMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSavingId(null);
    }
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

  const searching = query.trim().length > 0;
  const hiddenOnPhone = Math.max(0, filteredUsers.length - PHONE_VISIBLE);

  return (
    <section id="people" aria-labelledby="people-title" className="min-w-0 scroll-mt-24 rounded-md border border-border bg-card">
      {/* Sticky to the page scroller (no inner scroll box), so there is one scrollbar. */}
      <div className="sticky top-[var(--app-header-h,0px)] z-10 rounded-t-md border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-5">
          {/* The kit panel header (same title and count as Producer Team); search sits beside it at touch size. */}
          <PanelHeader
            titleAs="h2"
            titleId="people-title"
            title="People"
            count={searching ? null : users.length}
            status={
              searching ? (
                <span className="font-mono-broadcast text-[13px] tabular-nums text-muted-foreground">
                  {`${filteredUsers.length} of ${users.length}`}
                </span>
              ) : null
            }
            className="flex-1"
          />
          <span className="sr-only" aria-live="polite">
            {searching ? `${filteredUsers.length} of ${users.length} people` : ""}
          </span>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search people"
            ariaLabel="Search people"
            size="touch"
            shortcut={active ? "/" : undefined}
            className="w-full sm:w-72"
          />
        </div>
        {filteredUsers.length > 0 ? (
          <div aria-hidden="true" className={cn(ROW_GRID, "hidden border-t border-border px-4 py-2 sm:grid md:px-5")}>
            <span className={cn(COLUMN_LABEL_CLASS, "col-span-2")}>Person</span>
            <span className={cn(COLUMN_LABEL_CLASS, "px-2.5")}>Nickname</span>
            <span />
          </div>
        ) : null}
      </div>

      {filteredUsers.length === 0 ? (
        users.length === 0 ? (
          <EmptyState size="inline" icon={Users} title="No people yet." description="Use Add person." className="md:px-5" />
        ) : (
          <EmptyState
            size="inline"
            icon={SearchX}
            title="No people match that search."
            className="md:px-5"
            action={
              <Button type="button" variant="ghost" size="sm" className={ROW_ACTION_CLASS} onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        )
      ) : (
        <ul id={listId} aria-label="People">
          {filteredUsers.map((user, index) => {
            const label = personLabel(user);
            const draft = drafts[user.id];
            const dirty = draft !== undefined && draft.trim() !== (user.nickname ?? "");
            const role = user.email ? roleByEmail.get(user.email.toLowerCase()) : undefined;
            const deleting = deletingId === user.id;
            const busy = savingId === user.id || deleting;

            return (
              <li
                key={user.id}
                className={cn(
                  ROW_GRID,
                  // Top lines (not divide-y), so rows hidden on phones never leave a doubled edge.
                  "group/row border-t border-border px-4 py-2.5 transition-colors first:border-t-0 last:rounded-b-md hover:bg-[var(--ink-3)]/40 md:px-5",
                  index >= PHONE_VISIBLE && !showAllOnPhone && "max-sm:hidden"
                )}
              >
                <span aria-hidden="true" className="col-start-1 row-start-1 flex">
                  <Avatar name={label} size={32} title="" />
                </span>
                <div className="col-start-2 row-start-1 min-w-0">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{label}</span>
                    {role ? (
                      <StatusTag size="sm" tone="neutral">
                        {formatRoleLabel(role)}
                      </StatusTag>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {user.email ?? "No email"}
                    {user.name && user.name !== label ? ` · Google: ${user.name}` : ""}
                    {` · added ${addedOn(user.createdAt)}`}
                  </p>
                </div>
                {/* Phones: pulled left by the field's padding, so a quiet nickname lines up with the name above. */}
                <div className="col-start-2 row-start-2 min-w-0 max-sm:-ml-2.5 sm:col-start-3 sm:row-start-1">
                  <NicknameField
                    personName={label}
                    value={draft ?? user.nickname ?? ""}
                    dirty={dirty}
                    saving={savingId === user.id}
                    disabled={busy}
                    onChange={(value) => setDrafts((current) => ({ ...current, [user.id]: value }))}
                    onSave={() => void saveNickname(user)}
                    onRevert={() => setDrafts((current) => withoutKey(current, user.id))}
                  />
                </div>
                <div className="col-start-3 row-start-1 flex justify-end sm:col-start-4">
                  <RemoveButton
                    label={`Remove ${label}`}
                    busy={deleting}
                    disabled={busy}
                    onClick={() => setPendingDelete(user)}
                  />
                  {deleting ? <span className="sr-only">Removing…</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenOnPhone > 0 ? (
        <DisclosureToggle
          open={showAllOnPhone}
          onToggle={() => setShowAllOnPhone((open) => !open)}
          controls={listId}
          closedLabel={`Show ${hiddenOnPhone} more`}
          openLabel="Show fewer"
          className="rounded-b-md border-t border-border sm:hidden"
        />
      ) : null}

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
    </section>
  );
}
