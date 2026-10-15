import { useId, useState } from "react";
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
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";

/** Deny step for a producer. A reason is required and shown on the request. */
export function DenyExtensionDialog({
  onOpenChange,
  context,
  onConfirm
}: {
  onOpenChange: (open: boolean) => void;
  /** Which request this is ("Lunch line wait times · Cycle 3"). */
  context?: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = reason.trim();

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deny extension</DialogTitle>
          {context ? <p className="min-w-0 truncate text-sm text-foreground">{context}</p> : null}
          <DialogDescription>Say why. The group sees this reason on the request.</DialogDescription>
        </DialogHeader>

        <Field label="Reason" htmlFor={reasonId} required>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (!isSubmitShortcut(event)) return;
              event.preventDefault();
              if (!saving && trimmed) void confirm();
            }}
            maxLength={1200}
            rows={4}
            autoFocus
          />
          <SubmitShortcutHint action="deny" />
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={saving || !trimmed}>
            {saving ? <Spinner /> : null}
            Deny
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
