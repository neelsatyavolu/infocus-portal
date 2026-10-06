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
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";

/** Deny step for a producer. A reason is required and shown on the request. */
export function DenyExtensionDialog({
  onOpenChange,
  onConfirm
}: {
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
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
          <DialogDescription>Say why. The group sees this reason on the request.</DialogDescription>
        </DialogHeader>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Reason</span>
          <Textarea
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
          <SubmitShortcutHint action="deny" className="mt-1 block" />
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={saving || !trimmed}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Deny
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
