"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingsRow } from "@/components/settings-layout";
import { selectClass } from "./admin-types";

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
    <SettingsRow
      title="Class Board cycle"
      description="Which cycle's packages the Class Board shows. Current cycle moves on after each Final Cut deadline."
      htmlFor="class-board-cycle"
    >
      <select
        id="class-board-cycle"
        value={setting.cycleNumber === null ? AUTOMATIC : String(setting.cycleNumber)}
        onChange={(event) => void save(event.target.value)}
        disabled={!setting.canEdit || saving}
        className={`${selectClass} w-full sm:w-64`}
      >
        <option value={AUTOMATIC}>Current cycle (automatic)</option>
        {setting.cycles.map((cycle) => (
          <option key={cycle.cycleNumber} value={String(cycle.cycleNumber)}>
            Cycle {cycle.cycleNumber}
            {cycle.focus.trim() ? ` · ${cycle.focus.trim()}` : ""}
          </option>
        ))}
      </select>
    </SettingsRow>
  );
}
