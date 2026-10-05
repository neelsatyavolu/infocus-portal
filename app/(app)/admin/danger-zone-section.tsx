"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SettingsPanel, SettingsRow, SettingsSection } from "@/components/settings-layout";

const CONFIRM_TEXT = "RESET CYCLES";

/** Admin → Danger zone: reset every package cycle (super admin and adviser). */
export function DangerZoneSection({ onReset }: { onReset: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetCycles() {
    setError(null);
    setResetting(true);
    try {
      const response = await fetch("/api/admin/reset-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_TEXT })
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to reset cycles.");
        return;
      }

      const deleted = payload?.data?.deleted ?? {};
      toast.success(
        `Cycles reset. Deleted ${deleted.grades ?? 0} grades, ${deleted.historyEvents ?? 0} history events, ${deleted.progressRows ?? 0} progress rows. Cleared ${payload?.data?.cyclesCleared ?? 0} cycle definitions.`
      );
      setOpen(false);
      setConfirmInput("");
      await onReset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to reset cycles.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <SettingsSection id="danger-zone" title="Danger zone" tone="danger">
      <SettingsPanel tone="danger">
        <SettingsRow
          title="Reset all cycles"
          description="Wipe all package grades, grade history, and package progress rows for every cycle, and clear cycle dates and focus. Projects are not affected. This cannot be undone."
        >
          <Button
            variant="destructive-quiet"
            onClick={() => {
              setError(null);
              setConfirmInput("");
              setOpen(true);
            }}
          >
            <Trash2 />
            Reset all cycles…
          </Button>
        </SettingsRow>
      </SettingsPanel>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && resetting) return;
          setOpen(next);
          if (!next) {
            setConfirmInput("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset all cycles</DialogTitle>
            <DialogDescription>
              This permanently deletes every package grade, grade history event, and package progress row across all cycles, and clears each cycle&apos;s focus and dates. Projects are not affected. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="reset-cycles-confirm" className="text-sm text-foreground">
              Type <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to enable the button.
            </label>
            <Input
              id="reset-cycles-confirm"
              value={confirmInput}
              onChange={(event) => setConfirmInput(event.target.value)}
              disabled={resetting}
              autoComplete="off"
              placeholder={CONFIRM_TEXT}
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void resetCycles()}
              disabled={resetting || confirmInput !== CONFIRM_TEXT}
            >
              {resetting ? "Resetting…" : "Reset cycles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
