import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type GroupMember = { userId: string; name: string | null; email: string | null };
type Group = { id: string; groupTopic: string; members: GroupMember[] };

const inputClass = "h-10 w-full rounded-lg border border-border bg-muted px-3 text-foreground outline-none";

function memberLabel(member: GroupMember) {
  return member.name ?? member.email ?? "Unknown";
}

function groupLabel(group: Group) {
  const names = group.members.map(memberLabel).join(", ");
  return group.groupTopic ? `${names} · “${group.groupTopic}”` : names;
}

/**
 * Exec grants an extension to a package group (or some of its members).
 * Mount it only while open so its state starts fresh.
 */
export function GrantExtensionDialog({
  onOpenChange,
  onGranted
}: {
  onOpenChange: (open: boolean) => void;
  onGranted: () => Promise<void>;
}) {
  const [cycleNumber, setCycleNumber] = useState(1);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState(2);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingGroups(true);
    setGroupId("");
    setSelected([]);

    fetch(`/api/extensions/grants?cycleNumber=${cycleNumber}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body?.error?.message ?? "Failed to load package groups.");
        }
        if (!cancelled) setGroups(body.data.groups as Group[]);
      })
      .catch((error) => {
        if (!cancelled) {
          setGroups([]);
          toast.error(error instanceof Error ? error.message : "Failed to load package groups.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cycleNumber]);

  const group = groups.find((entry) => entry.id === groupId) ?? null;

  function pickGroup(id: string) {
    setGroupId(id);
    setSelected(groups.find((entry) => entry.id === id)?.members.map((member) => member.userId) ?? []);
  }

  function toggle(userId: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current.filter((id) => id !== userId), userId] : current.filter((id) => id !== userId)
    );
  }

  async function grant() {
    setSaving(true);
    try {
      const response = await fetch("/api/extensions/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressRowId: groupId, days, grantedUserIds: selected, reason })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Failed to grant extension.");
      }
      toast.success("Extension granted. One more exec must approve it.");
      await onGranted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to grant extension.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant an extension</DialogTitle>
          <DialogDescription>
            No group agreement needed. One more executive producer must approve, then every chosen
            student gets an email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Cycle</span>
              <input
                type="number"
                min={1}
                value={cycleNumber}
                onChange={(event) => setCycleNumber(Math.max(1, Math.round(Number(event.target.value)) || 1))}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Days</span>
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(event) =>
                  setDays(Math.min(30, Math.max(1, Math.round(Number(event.target.value)) || 1)))
                }
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Group</span>
            <select
              value={groupId}
              onChange={(event) => pickGroup(event.target.value)}
              disabled={loadingGroups || groups.length === 0}
              className={inputClass}
            >
              <option value="">
                {loadingGroups ? "Loading groups…" : groups.length === 0 ? "No groups in this cycle" : "Pick a group"}
              </option>
              {groups.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {groupLabel(entry)}
                </option>
              ))}
            </select>
          </label>

          {group ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs text-muted-foreground">Students</legend>
              {group.members.map((member) => (
                <label key={member.userId} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selected.includes(member.userId)}
                    onChange={(event) => toggle(member.userId, event.target.checked)}
                  />
                  {memberLabel(member)}
                </label>
              ))}
            </fieldset>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Reason (optional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void grant()} disabled={saving || !group || selected.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
