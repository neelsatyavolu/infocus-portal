"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPanel, SettingsRow, SettingsSection } from "@/components/settings-layout";
import { ClassBoardCycleSetting } from "./class-board-cycle-setting";

/** Admin → Package Cycles: cycles per semester and the Class Board's cycle. */
export function PackageCyclesSection({
  cyclesPerSemester,
  onCyclesPerSemesterChange
}: {
  cyclesPerSemester: number;
  onCyclesPerSemesterChange: (value: number) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/platform/program-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cyclesPerSemester })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to save cycle count.");
      }

      toast.success("Cycles per semester updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save cycle count.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection id="package-cycles" title="Package Cycles">
      <SettingsPanel>
        <SettingsRow
          title="Cycles per semester"
          description="Drives the progress sheet, cycle tabs, and the maximum points in the packages grade category."
          htmlFor="cycles-per-semester"
        >
          <form onSubmit={save} className="flex items-center gap-2">
            <Input
              id="cycles-per-semester"
              type="number"
              min={1}
              max={8}
              value={cyclesPerSemester}
              onChange={(event) => onCyclesPerSemesterChange(Math.max(1, Number(event.target.value) || 1))}
              className="w-20 font-mono tabular-nums"
            />
            <Button type="submit" variant="outline" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </SettingsRow>
        <ClassBoardCycleSetting />
      </SettingsPanel>
    </SettingsSection>
  );
}
