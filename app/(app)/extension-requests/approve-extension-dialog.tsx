import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

export type GrantTerms = { grantedDays: number; grantedUserIds: string[] };

type Member = { userId: string; label: string };

/**
 * Approve step for a producer. The first approver picks days and members;
 * once another producer has approved, those terms are shown read-only.
 * Mount it only while approving so its state starts from `initialTerms`.
 */
export function ApproveExtensionDialog({
  open,
  onOpenChange,
  requestedDays,
  members,
  lockedTerms,
  initialTerms,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestedDays: number;
  members: Member[];
  /** Terms set by another producer; approval must accept them as-is. */
  lockedTerms: GrantTerms | null;
  /** Starting values when this producer sets the terms. */
  initialTerms: GrantTerms;
  onConfirm: (terms: GrantTerms | null) => Promise<void>;
}) {
  const [days, setDays] = useState(initialTerms.grantedDays);
  const [selected, setSelected] = useState<string[]>(initialTerms.grantedUserIds);
  const [saving, setSaving] = useState(false);

  function toggle(userId: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current.filter((id) => id !== userId), userId] : current.filter((id) => id !== userId)
    );
  }

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm(lockedTerms ? null : { grantedDays: days, grantedUserIds: selected });
    } finally {
      setSaving(false);
    }
  }

  const labelFor = (userId: string) => members.find((member) => member.userId === userId)?.label ?? "Unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve extension</DialogTitle>
          <DialogDescription>
            {lockedTerms
              ? "Another producer already set these terms. Approving agrees to them as-is."
              : `The group asked for ${requestedDays} ${requestedDays === 1 ? "day" : "days"}. Choose how many days to grant and who gets them.`}
          </DialogDescription>
        </DialogHeader>

        {lockedTerms ? (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              +{lockedTerms.grantedDays} {lockedTerms.grantedDays === 1 ? "day" : "days"}
            </p>
            <p className="text-muted-foreground">{lockedTerms.grantedUserIds.map(labelFor).join(", ")}</p>
          </div>
        ) : (
          <div className="space-y-4">
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
                className="h-10 w-28 rounded-lg border border-border bg-muted px-3 text-foreground outline-none"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs text-muted-foreground">Students</legend>
              {members.map((member) => (
                <label key={member.userId} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selected.includes(member.userId)}
                    onChange={(event) => toggle(member.userId, event.target.checked)}
                  />
                  {member.label}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={saving || (!lockedTerms && selected.length === 0)}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
