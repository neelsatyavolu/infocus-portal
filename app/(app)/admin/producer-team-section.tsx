"use client";

import { FormEvent, useMemo, useState } from "react";
import { UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";
import {
  formatRoleLabel,
  personLabel,
  selectClass,
  type PlatformRole,
  type PlatformUser,
  type ReportMessage,
  type RoleAssignment
} from "./admin-types";

const ROLE_ORDER: Record<PlatformRole, number> = {
  SUPER_ADMIN: 0,
  ADVISER: 1,
  EXECUTIVE_PRODUCER: 2,
  ASSOCIATE_PRODUCER: 3
};

/** Admin → Producer Team: associate, executive, and adviser roles. */
export function ProducerTeamSection({
  roles,
  users,
  canManage,
  onChanged,
  onMessage
}: {
  roles: RoleAssignment[];
  users: PlatformUser[];
  canManage: boolean;
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlatformRole>("ASSOCIATE_PRODUCER");
  const [saving, setSaving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ entry: RoleAssignment; label: string } | null>(null);

  const userByEmail = useMemo(
    () => new Map(users.flatMap((user) => (user.email ? [[user.email.toLowerCase(), user] as const] : []))),
    [users]
  );

  const pickable = useMemo(
    () =>
      users
        .filter((user) => user.email)
        .sort((a, b) => personLabel(a).toLowerCase().localeCompare(personLabel(b).toLowerCase())),
    [users]
  );

  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) => {
        const byRole = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
        return byRole !== 0 ? byRole : a.email.localeCompare(b.email);
      }),
    [roles]
  );

  async function upsertRole(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || saving) return;

    setSaving(true);
    onMessage(null);
    try {
      const response = await fetch("/api/platform/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to update role.");
      }

      setEmail("");
      await onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update role.";
      onMessage(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Throws on failure so the confirm dialog stays open for a retry.
  async function removeRole(roleEmail: string) {
    onMessage(null);
    try {
      const response = await fetch(`/api/platform/roles?email=${encodeURIComponent(roleEmail)}`, {
        method: "DELETE"
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to remove role.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove role.";
      onMessage(message);
      toast.error(message);
      throw error;
    }

    await onChanged();
  }

  return (
    <SettingsSection
      id="producer-team"
      title="Producer Team"
      description="Give someone in People a producer role. Add them to People first if they're missing."
    >
      <SettingsPanel>
        <SettingsPanelBody>
          {canManage ? (
            <form onSubmit={upsertRole} className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
              <select value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Person" className={selectClass}>
                <option value="">Choose a person</option>
                {pickable.map((user) => (
                  <option key={user.id} value={user.email ?? ""}>
                    {personLabel(user)}
                  </option>
                ))}
              </select>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as PlatformRole)}
                aria-label="Role"
                className={selectClass}
              >
                <option value="ASSOCIATE_PRODUCER">Associate Producer</option>
                <option value="EXECUTIVE_PRODUCER">Executive Producer</option>
                <option value="ADVISER">Adviser</option>
              </select>
              <Button type="submit" disabled={!email.trim() || saving}>
                {saving ? "Saving…" : "Save role"}
              </Button>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
              Only the super admin or the adviser can add or remove producer roles.
            </p>
          )}
        </SettingsPanelBody>

        <ul className="divide-y divide-border">
          {sortedRoles.map((entry) => {
            const user = userByEmail.get(entry.email.toLowerCase());
            const name = user ? personLabel(user) : null;
            return (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{name ?? entry.email}</p>
                  {name && name !== entry.email ? (
                    <p className="truncate text-[13px] text-muted-foreground">{entry.email}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-sm border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
                    {formatRoleLabel(entry.role)}
                  </span>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingRemoval({ entry, label: name ?? entry.email })}
                      disabled={pendingRemoval !== null}
                      aria-label={`Remove ${formatRoleLabel(entry.role)} role from ${name ?? entry.email}`}
                      title="Remove role"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {sortedRoles.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">No producer roles assigned yet.</li>
          ) : null}
        </ul>
      </SettingsPanel>
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title={
          pendingRemoval
            ? `Remove ${formatRoleLabel(pendingRemoval.entry.role)} role from ${pendingRemoval.label}?`
            : "Remove role?"
        }
        description="They keep their sign-in but lose this role's access."
        confirmLabel="Remove role"
        onConfirm={() => (pendingRemoval ? removeRole(pendingRemoval.entry.email) : undefined)}
      />
    </SettingsSection>
  );
}
