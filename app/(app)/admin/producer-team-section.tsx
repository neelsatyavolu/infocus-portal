"use client";

import { FormEvent, useMemo, useState } from "react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader } from "@/components/kit/panel";
import { SectionLabel } from "@/components/kit/section";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/src/lib/utils";
import { RemoveButton } from "./admin-ui";
import {
  errorText,
  formatRoleLabel,
  personLabel,
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

const GROUP_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADVISER: "Advisers",
  EXECUTIVE_PRODUCER: "Executive producers",
  ASSOCIATE_PRODUCER: "Associate producers"
};

/**
 * Admin → Producer Team: associate, executive, and adviser roles, grouped by role. Its own
 * container, so the assign form is one row when the panel is wide (stacked under People) and
 * stacked when it is the narrow side column.
 */
export function ProducerTeamSection({
  roles,
  users,
  canManage,
  onChanged,
  onMessage,
  className
}: {
  roles: RoleAssignment[];
  users: PlatformUser[];
  canManage: boolean;
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
  className?: string;
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

  const groups = useMemo(() => {
    const sorted = [...roles].sort((a, b) => {
      const byRole = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      return byRole !== 0 ? byRole : a.email.localeCompare(b.email);
    });
    return (Object.keys(ROLE_ORDER) as PlatformRole[])
      .map((groupRole) => ({ role: groupRole, entries: sorted.filter((entry) => entry.role === groupRole) }))
      .filter((group) => group.entries.length > 0);
  }, [roles]);

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
      const message = errorText(error, "Failed to update role.");
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
      const message = errorText(error, "Failed to remove role.");
      onMessage(message);
      toast.error(message);
      throw error;
    }

    await onChanged();
  }

  return (
    <section
      id="producer-team"
      aria-labelledby="producer-team-title"
      className={cn("@container min-w-0 scroll-mt-24 rounded-md border border-border bg-card", className)}
    >
      <PanelHeader
        titleAs="h2"
        titleId="producer-team-title"
        title="Producer Team"
        count={roles.length}
        description="Producer roles for people in People. Add them to People first if they're missing."
        className="border-b border-border px-4 py-3 md:px-5"
      />

      {canManage ? (
        <form
          onSubmit={upsertRole}
          className="grid gap-2 border-b border-border px-4 py-4 md:px-5 @lg:grid-cols-[minmax(0,1fr)_12rem_auto] @lg:items-center"
        >
          <NativeSelect value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Person">
            <option value="">Choose a person</option>
            {pickable.map((user) => (
              <option key={user.id} value={user.email ?? ""}>
                {personLabel(user)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={role} onChange={(event) => setRole(event.target.value as PlatformRole)} aria-label="Role">
            <option value="ASSOCIATE_PRODUCER">Associate Producer</option>
            <option value="EXECUTIVE_PRODUCER">Executive Producer</option>
            <option value="ADVISER">Adviser</option>
          </NativeSelect>
          <Button type="submit" variant="outline" className="w-full @lg:w-auto" disabled={!email.trim() || saving}>
            {saving ? "Saving…" : "Save role"}
          </Button>
          <p className="text-[13px] leading-snug text-muted-foreground @lg:col-span-3">
            Pick someone who already has a role to change it.
          </p>
        </form>
      ) : (
        <p className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] text-muted-foreground md:px-5">
          <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
          Only the super admin or the adviser can add or remove producer roles.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground md:px-5">No producer roles assigned yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {groups.map((group) => (
            <div key={group.role} className="px-4 pb-1 pt-3 md:px-5">
              <SectionLabel as="h3" count={group.entries.length}>
                {GROUP_LABEL[group.role]}
              </SectionLabel>
              <ul aria-label={GROUP_LABEL[group.role]}>
                {group.entries.map((entry) => {
                  const user = userByEmail.get(entry.email.toLowerCase());
                  const name = user ? personLabel(user) : null;
                  const label = name ?? entry.email;
                  return (
                    <li key={entry.id} className="flex min-h-12 items-center justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{label}</p>
                        {name && name !== entry.email ? (
                          <p className="truncate text-[13px] text-muted-foreground">{entry.email}</p>
                        ) : null}
                      </div>
                      {canManage ? (
                        <RemoveButton
                          label={`Remove ${formatRoleLabel(entry.role)} role from ${label}`}
                          onClick={() => setPendingRemoval({ entry, label })}
                          disabled={pendingRemoval !== null}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

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
    </section>
  );
}
