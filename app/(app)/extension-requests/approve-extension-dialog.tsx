import { useId, useState } from "react";
import { Alert } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
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
import { clampExtensionDays } from "@/src/lib/package-extensions";
import { DaysField } from "./extension-days-input";
import { MemberChecklist } from "./member-checklist";
import { daysLabel, type GrantTerms } from "./request-view";

type Member = { userId: string; label: string };

/**
 * Approve step for a producer. The first approver picks days and members;
 * once another producer has approved, those terms are shown read-only.
 * Mount it only while approving so its state starts from `initialTerms`.
 * With `grantWithoutAgreement`, an exec grants a request the group hasn't fully agreed to.
 */
export function ApproveExtensionDialog({
  open,
  onOpenChange,
  requestedDays,
  members,
  lockedTerms,
  initialTerms,
  grantWithoutAgreement = false,
  context,
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
  grantWithoutAgreement?: boolean;
  /** Which request this is ("Lunch line wait times · Cycle 3"). */
  context?: string;
  onConfirm: (terms: GrantTerms | null) => Promise<void>;
}) {
  const daysId = useId();
  const [days, setDays] = useState(initialTerms.grantedDays);
  const [selected, setSelected] = useState<string[]>(initialTerms.grantedUserIds);
  const [saving, setSaving] = useState(false);

  const canConfirm = !saving && (Boolean(lockedTerms) || selected.length > 0);

  async function confirm() {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await onConfirm(lockedTerms ? null : { grantedDays: clampExtensionDays(days), grantedUserIds: selected });
    } finally {
      setSaving(false);
    }
  }

  const labelFor = (userId: string) => members.find((member) => member.userId === userId)?.label ?? "Unknown";
  const actionLabel = grantWithoutAgreement ? "Grant" : "Approve";

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{grantWithoutAgreement ? "Grant extension" : "Approve extension"}</DialogTitle>
          {context ? <p className="min-w-0 truncate text-sm text-foreground">{context}</p> : null}
          <DialogDescription>
            {lockedTerms
              ? "Another producer already set these terms. Approving agrees to them as-is."
              : `The group asked for ${daysLabel(requestedDays)}. Choose how many days to grant and who gets them.`}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          {grantWithoutAgreement ? (
            <Alert tone="warning" compact>
              Not every member has agreed yet; granting skips their agreement. One more exec must approve.
            </Alert>
          ) : null}

          {lockedTerms ? (
            <KeyValueList
              labelWidth="6rem"
              className="rounded-md border border-border px-3"
              items={[
                { label: "Days", value: `+${daysLabel(lockedTerms.grantedDays)}`, mono: true },
                { label: "Students", value: lockedTerms.grantedUserIds.map(labelFor).join(", ") }
              ]}
            />
          ) : (
            <>
              <DaysField id={daysId} value={days} onChange={setDays} className="w-32" />
              <MemberChecklist members={members} selected={selected} onChange={setSelected} />
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canConfirm}>
              {saving ? <Spinner /> : null}
              {actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
