"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import { Button } from "@/components/ui/button";

export default function ApprovePitchButton({ rowId, onApproved }: {
  rowId: string;
  onApproved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function approve(feedback: string) {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/package-cycle/stage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "approve-pitching", rowId, approved: true, feedback: feedback || undefined })
      });
      if (!response.ok) throw new Error("Could not approve pitch.");
      setOpen(false);
      toast.success("Pitch approved.");
      onApproved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve pitch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" className="relative z-10 ml-auto h-7 gap-1.5 px-2 text-xs" disabled={saving} onClick={() => setOpen(true)}>
        <Check className="h-3 w-3" />Approve pitch
      </Button>
      <ApproveFeedbackDialog
        open={open}
        saving={saving}
        onOpenChange={(next) => { if (!saving) setOpen(next); }}
        onConfirm={(feedback) => void approve(feedback)}
      />
    </>
  );
}
