"use client";

import { Check, ClipboardCheck } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";

/**
 * The after-filming check, at the top while it is due. The title is the reminder email's heading,
 * and the email tells the show manager to fix anything wrong and then press "Roles are correct",
 * so both must stay exactly that. It isn't the generator's per-role "confirmed" count in the Show
 * roles card, which is why it never calls itself "Confirm". Crew roles are fixed with Open generator.
 */
export function ShowConfirmBanner({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  return (
    <Alert
      tone="warning"
      icon={ClipboardCheck}
      title="Are the show roles right?"
      action={
        // Full width under the words on phones; the hit area grows to 40px there without changing the look.
        <Button
          type="button"
          size="sm"
          className="relative max-sm:flex-1 max-sm:after:absolute max-sm:after:-inset-1"
          disabled={busy}
          onClick={onConfirm}
        >
          <Check aria-hidden />
          Roles are correct
        </Button>
      }
    >
      After filming, the show manager is emailed every 3 hours until the roles are confirmed. Fix anchors and the show
      manager below, and crew roles with Open generator.
    </Alert>
  );
}
