"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPanel, SettingsPanelBody } from "@/components/settings-layout";
import type { ProgramConfig, SchoolYear } from "@/src/lib/program-config";
import { addDaysToDateKey } from "@/src/lib/show-assignment";

const FIELDS = [
  { key: "firstDay", label: "First day of school" },
  { key: "firstShowDate", label: "First show" },
  { key: "lastDay", label: "Last day of school" }
] as const;

function yearTitle(year: SchoolYear) {
  const start = Number(year.firstDay.slice(0, 4));
  return Number.isFinite(start) && start > 0 ? `${start}–${String(start + 1).slice(-2)}` : "New school year";
}

/** Admin → Configuration: the dates each school year runs. */
export function SchoolYearsPanel({
  years: saved,
  onSaved
}: {
  years: SchoolYear[];
  onSaved: (config: ProgramConfig) => void | Promise<void>;
}) {
  const [years, setYears] = useState<SchoolYear[]>(saved);
  const [saving, setSaving] = useState(false);

  function change(index: number, key: (typeof FIELDS)[number]["key"], value: string) {
    setYears((current) => current.map((year, at) => (at === index ? { ...year, [key]: value } : year)));
  }

  function addYear() {
    const last = years[years.length - 1];
    // 52 weeks on, so each date lands on the same weekday. The person adding it sets the real dates.
    setYears((current) => [
      ...current,
      {
        firstDay: addDaysToDateKey(last.firstDay, 364),
        firstShowDate: addDaysToDateKey(last.firstShowDate, 364),
        lastDay: addDaysToDateKey(last.lastDay, 364),
        source: "manual"
      }
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/platform/program-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolYears: years })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Could not save the school years.");
      }
      const config = payload.data as ProgramConfig;
      setYears(config.schoolYears);
      await onSaved(config);
      toast.success("School years saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the school years.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPanel>
      <SettingsPanelBody className="space-y-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">School years</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Shows run Wednesday and Friday from the first show to the last day of school, and PA runs on Mondays. Nothing is
            scheduled over the summer.
          </p>
        </div>

        {years.map((year, index) => (
          <fieldset key={index} className="space-y-2">
            <legend className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              {yearTitle(year)}
              {year.source === "feed" ? (
                <span className="meta-pill">Read from Paly&apos;s calendar. Check the dates, then save.</span>
              ) : null}
            </legend>
            <div className="flex flex-wrap items-end gap-3">
              {FIELDS.map((field) => (
                <label key={field.key} className="space-y-1 text-xs text-muted-foreground">
                  <span className="block">{field.label}</span>
                  <Input
                    type="date"
                    value={year[field.key]}
                    onChange={(event) => change(index, field.key, event.target.value)}
                    className="w-40 font-mono tabular-nums"
                  />
                </label>
              ))}
              {years.length > 1 ? (
                <Button
                  type="button"
                  variant="destructive-quiet"
                  onClick={() => setYears((current) => current.filter((_, at) => at !== index))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </fieldset>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addYear}>
            Add a school year
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save school years"}
          </Button>
        </div>
      </SettingsPanelBody>
    </SettingsPanel>
  );
}
