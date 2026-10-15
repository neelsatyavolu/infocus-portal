"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** "Mark as aired": pick the air date (UTC day) for an approved version. */
export function AiredDateDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  saving,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  saving: boolean;
  onConfirm: () => void;
}) {
  const inputId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as aired</DialogTitle>
          <DialogDescription>Pick the date this video aired.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={inputId} className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            Air date
          </label>
          <Input id={inputId} type="date" value={value} onChange={(event) => onValueChange(event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!value || saving}>
            Mark as aired
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
