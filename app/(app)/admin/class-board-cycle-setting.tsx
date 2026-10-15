"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/kit/skeleton";
import { SaveState, type SaveStateValue } from "@/components/kit/status-tag";
import { NativeSelect } from "@/components/ui/native-select";
import { SettingsCell } from "@/components/settings-layout";

type Setting = {
  cycleNumber: number | null;
  cycles: Array<{ cycleNumber: number; focus: string }>;
  canEdit: boolean;
};

const AUTOMATIC = "auto";
/** How long "Saved" stays beside the select after a change. */
const SAVED_MS = 4000;

/**
 * Admin → Package Cycles: which cycle the Class Board shows. Saves on change, with the result
 * shown beside the select. If it can't load, the cell says so instead of disappearing.
 */
export function ClassBoardCycleSetting() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveStateValue>("idle");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/platform/class-board-cycle", { cache: "no-store" });
        const body = (await response.json()) as { data?: Setting };
        if (response.ok && body.data) setSetting(body.data);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  async function save(value: string) {
    const cycleNumber = value === AUTOMATIC ? null : Number(value);
    setSaveState("saving");
    try {
      const response = await fetch("/api/platform/class-board-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleNumber })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not save the Class Board cycle.");
      setSetting((current) => (current ? { ...current, cycleNumber } : current));
      setSaveState("saved");
      toast.success(cycleNumber ? `Class Board shows Cycle ${cycleNumber}.` : "Class Board follows the current cycle.");
    } catch (error) {
      setSaveState("error");
      toast.error(error instanceof Error ? error.message : "Could not save the Class Board cycle.");
    }
  }

  const saving = saveState === "saving";

  return (
    <SettingsCell
      title="Class Board cycle"
      description="Which cycle's packages the Class Board shows. Current cycle moves on after each Final Cut deadline."
      htmlFor={setting ? "class-board-cycle" : undefined}
    >
      {setting ? (
        <>
          <NativeSelect
            id="class-board-cycle"
            value={setting.cycleNumber === null ? AUTOMATIC : String(setting.cycleNumber)}
            onChange={(event) => void save(event.target.value)}
            disabled={!setting.canEdit || saving}
            wrapperClassName="min-w-0 flex-1"
          >
            <option value={AUTOMATIC}>Current cycle (automatic)</option>
            {setting.cycles.map((cycle) => (
              <option key={cycle.cycleNumber} value={String(cycle.cycleNumber)}>
                Cycle {cycle.cycleNumber}
                {cycle.focus.trim() ? ` · ${cycle.focus.trim()}` : ""}
              </option>
            ))}
          </NativeSelect>
          <SaveState state={saveState} />
        </>
      ) : failed ? (
        <p className="flex min-h-9 items-center text-[13px] text-danger">Couldn&apos;t load the Class Board cycle.</p>
      ) : (
        <Skeleton className="h-9 w-full rounded-md" />
      )}
    </SettingsCell>
  );
}
