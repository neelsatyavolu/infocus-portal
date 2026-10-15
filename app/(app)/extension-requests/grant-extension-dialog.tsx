import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/kit/field";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { clampExtensionDays } from "@/src/lib/package-extensions";
import { DaysField } from "./extension-days-input";
import { MemberChecklist } from "./member-checklist";
import { memberLabel } from "./request-view";

type GroupMember = { userId: string; name: string | null; email: string | null };
type Group = { id: string; groupTopic: string; members: GroupMember[] };

/** Topic first, like the request rows: "Lunch line wait times · Abby, Otto". */
function groupLabel(group: Group) {
  const names = group.members.map(memberLabel).join(", ");
  return group.groupTopic ? `${group.groupTopic} · ${names}` : names;
}

/**
 * Exec grants an extension to a package group (or some of its members).
 * Mount it only while open so its state starts fresh.
 */
export function GrantExtensionDialog({
  initialCycleNumber,
  cycleNumbers,
  onOpenChange,
  onGranted
}: {
  /** The current cycle; the dialog opens on it. */
  initialCycleNumber: number;
  /** Real cycle numbers this semester, for the Cycle picker. */
  cycleNumbers: number[];
  onOpenChange: (open: boolean) => void;
  onGranted: () => Promise<void>;
}) {
  const ids = useId();
  const [cycleNumber, setCycleNumber] = useState(initialCycleNumber);
  const [groups, setGroups] = useState<Group[]>([]);
  // The groups for the opening cycle load as soon as the dialog mounts.
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [groupId, setGroupId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState(2);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/extensions/grants?cycleNumber=${cycleNumber}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error?.message ?? "Failed to load package groups.");
        }
        if (!cancelled) setGroups((body?.data?.groups ?? []) as Group[]);
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
  const cycleOptions = cycleNumbers.includes(cycleNumber) ? cycleNumbers : [...cycleNumbers, cycleNumber];

  /** A new cycle starts over: its groups load and nothing is picked. */
  function changeCycle(next: number) {
    if (next === cycleNumber) return;
    setCycleNumber(next);
    setLoadingGroups(true);
    setGroupId("");
    setSelected([]);
  }

  function pickGroup(id: string) {
    setGroupId(id);
    setSelected(groups.find((entry) => entry.id === id)?.members.map((member) => member.userId) ?? []);
  }

  const canGrant = !saving && Boolean(group) && selected.length > 0;

  async function grant() {
    if (!canGrant) return;
    setSaving(true);
    try {
      const response = await fetch("/api/extensions/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressRowId: groupId, days: clampExtensionDays(days), grantedUserIds: selected, reason })
      });
      const body = await response.json().catch(() => null);
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
    <Dialog open onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant an extension</DialogTitle>
          <DialogDescription>
            No group agreement needed. One more executive producer must approve, then every chosen
            student gets an email.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void grant();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cycle" htmlFor={`${ids}-cycle`}>
              <NativeSelect
                id={`${ids}-cycle`}
                value={cycleNumber}
                onChange={(event) => changeCycle(Number(event.target.value))}
              >
                {cycleOptions.map((value) => (
                  <option key={value} value={value}>
                    Cycle {value}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <DaysField id={`${ids}-days`} value={days} onChange={setDays} />
          </div>

          <Field label="Group" htmlFor={`${ids}-group`}>
            <NativeSelect
              id={`${ids}-group`}
              value={groupId}
              onChange={(event) => pickGroup(event.target.value)}
              disabled={loadingGroups || groups.length === 0}
              placeholderOption={
                loadingGroups ? "Loading groups…" : groups.length === 0 ? "No groups in this cycle" : "Pick a group"
              }
            >
              {groups.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {groupLabel(entry)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          {group ? (
            <MemberChecklist
              members={group.members.map((member) => ({ userId: member.userId, label: memberLabel(member) }))}
              selected={selected}
              onChange={setSelected}
            />
          ) : null}

          <Field label="Reason (optional)" htmlFor={`${ids}-reason`}>
            <Input id={`${ids}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canGrant}>
              {saving ? <Spinner /> : null}
              Grant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
