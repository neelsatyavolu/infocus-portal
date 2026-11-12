"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";

export const CONTROVERSIAL_HINT = "Needs 3 executive approvals";

/**
 * Stage 3: flag a package controversial, so it needs three executive approvals instead of two
 * (docs/class-rules-2026-27.md, Approvals).
 */
export function ControversialToggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-describedby={`${id}-hint`} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-foreground">Controversial</span>
        <span id={`${id}-hint`} className={checked ? "block text-[13px] text-muted-foreground" : "sr-only"}>
          {CONTROVERSIAL_HINT}
        </span>
      </label>
    </div>
  );
}
