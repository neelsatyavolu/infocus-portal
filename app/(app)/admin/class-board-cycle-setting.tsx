"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type Setting = {
  cycleNumber: number | null;
  cycles: Array<{ cycleNumber: number; focus: string }>;
  canEdit: boolean;
};

const AUTOMATIC = "auto";

/** Admin → Package Cycles: which cycle the Class Board shows. */
export function ClassBoardCycleSetting() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/platform/class-board-cycle", { cache: "no-store" });
        const body = (await response.json()) as { data?: Setting };
        if (response.ok && body.data) setSetting(body.data);
      } catch {
        // Leave the control hidden if it can't load.
      }
    })();
  }, []);

  if (!setting) return null;

  async function save(value: string) {
    const cycleNumber = value === AUTOMATIC ? null : Number(value);
    setSaving(true);
    try {
      const response = await fetch("/api/platform/class-board-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleNumber })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not save the Class Board cycle.");
      setSetting((current) => (current ? { ...current, cycleNumber } : current));
      toast.success(cycleNumber ? `Class Board shows Cycle ${cycleNumber}.` : "Class Board follows the current cycle.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the Class Board cycle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <label htmlFor="class-board-cycle" className="text-sm font-medium text-foreground">
        Class Board cycle
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Which cycle&apos;s packages the Class Board shows. Current cycle moves on after each Final Cut deadline.
      </p>
      <select
        id="class-board-cycle"
        value={setting.cycleNumber === null ? AUTOMATIC : String(setting.cycleNumber)}
        onChange={(event) => void save(event.target.value)}
        disabled={!setting.canEdit || saving}
        className="mt-2 h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none disabled:opacity-50 sm:w-72"
      >
        <option value={AUTOMATIC}>Current cycle (automatic)</option>
        {setting.cycles.map((cycle) => (
          <option key={cycle.cycleNumber} value={String(cycle.cycleNumber)}>
            Cycle {cycle.cycleNumber}
            {cycle.focus.trim() ? ` · ${cycle.focus.trim()}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
