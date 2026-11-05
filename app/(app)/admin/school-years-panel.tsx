"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { SettingsPanelHeader } from "@/components/settings-layout";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProgramConfig, SchoolYear } from "@/src/lib/program-config";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS, RemoveButton } from "./admin-ui";

const FIELDS = [
  { key: "firstDay", label: "First day of school" },
  { key: "firstShowDate", label: "First show" },
  { key: "secondSemesterFirstShowDate", label: "S2 first show" },
  { key: "lastDay", label: "Last day of school" }
] as const;

/**
 * Year | four dates | remove, spread across the panel so it lines up with the footer buttons.
 * From @4xl only: the tracks need about 800px, and the row is narrower than that at @3xl.
 */
const YEAR_GRID =
  "grid grid-cols-[minmax(0,1fr)_2.5rem] gap-x-3 gap-y-3 @4xl:grid-cols-[8rem_repeat(4,minmax(9rem,1fr))_2.5rem] @4xl:items-center";

function yearTitle(year: SchoolYear) {
  const start = Number(year.firstDay.slice(0, 4));
  return Number.isFinite(start) && start > 0 ? `${start}–${String(start + 1).slice(-2)}` : "New school year";
}

/** Compares years by their values (key order differs between the server and a new row). */
function yearsKey(years: readonly SchoolYear[]) {
  return years.map((year) => [year.firstDay, year.firstShowDate, year.secondSemesterFirstShowDate ?? "", year.lastDay, year.source].join("|")).join(";");
}

/**
 * Admin → School calendar: the dates each school year runs, as one aligned table. Edits stay
 * local until "Save school years". When the saved years change (Sync now, or the quiet sync after
 * a hand-set day is removed), the table resets to them, as it always has: otherwise saving an
 * older draft would delete a year the sync just added. If that throws away unsaved edits, a toast
 * says so.
 */
export function SchoolYearsPanel({
  years: saved,
  onSaved
}: {
  years: SchoolYear[];
  onSaved: (config: ProgramConfig) => void | Promise<void>;
}) {
  const [years, setYears] = useState<SchoolYear[]>(saved);
  const [base, setBase] = useState(() => yearsKey(saved));
  const [saving, setSaving] = useState(false);
  /** The saved years that last replaced unsaved edits, so the toast fires once per change. */
  const [clearedFor, setClearedFor] = useState<string | null>(null);

  const savedKey = yearsKey(saved);
  const draftKey = yearsKey(years);
  // A sync or save brought new saved years: show them (unsaved edits give way to the saved list).
  if (savedKey !== base) {
    if (draftKey !== base) setClearedFor(savedKey);
    setBase(savedKey);
    setYears(saved);
  }

  useEffect(() => {
    if (clearedFor === null) return;
    toast.info("School years were updated from Paly's calendar, so your unsaved edits were cleared.");
  }, [clearedFor]);
  const dirty = draftKey !== savedKey;
  const needsCheck = years.some((year) => year.source === "feed");

  function change(index: number, key: (typeof FIELDS)[number]["key"], value: string) {
    // A cleared second-semester first show is left out, so second semester has shows from its start.
    const next = key === "secondSemesterFirstShowDate" && !value ? undefined : value;
    setYears((current) => current.map((year, at) => (at === index ? { ...year, [key]: next } : year)));
  }

  function addYear() {
    const last = years[years.length - 1];
    // 52 weeks on, so each date lands on the same weekday. The person adding it sets the real dates.
    setYears((current) => [
      ...current,
      {
        firstDay: addDaysToDateKey(last.firstDay, 364),
        firstShowDate: addDaysToDateKey(last.firstShowDate, 364),
        ...(last.secondSemesterFirstShowDate
          ? { secondSemesterFirstShowDate: addDaysToDateKey(last.secondSemesterFirstShowDate, 364) }
          : {}),
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
      setBase(yearsKey(config.schoolYears));
      await onSaved(config);
      toast.success("School years saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the school years.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col">
      <SettingsPanelHeader
        title="School years"
        status={
          <>
            {dirty ? <StatusTag tone="warning">Unsaved changes</StatusTag> : null}
            {needsCheck ? <StatusTag tone="warning">Check dates</StatusTag> : null}
          </>
        }
        description="Shows run Wednesday and Friday from the first show to the last day of school, except in second semester before its first show (S2 first show). PA runs on Mondays. Nothing is scheduled over the summer."
      />

      <div aria-hidden="true" className={cn(YEAR_GRID, "hidden border-t border-border px-4 py-2 @4xl:grid md:px-5")}>
        <span className={COLUMN_LABEL_CLASS}>Year</span>
        {FIELDS.map((field) => (
          <span key={field.key} className={COLUMN_LABEL_CLASS}>
            {field.label}
          </span>
        ))}
        <span />
      </div>

      <ul aria-label="School years" className="divide-y divide-border border-t border-border">
        {years.map((year, index) => {
          const title = yearTitle(year);
          return (
            <li key={index} className={cn(YEAR_GRID, "px-4 py-3 md:px-5")}>
              <div className="col-start-1 row-start-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                {year.source === "feed" ? (
                  <>
                    <StatusTag size="sm" tone="neutral" className="mt-1">
                      From Paly&apos;s calendar
                    </StatusTag>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">Check the dates, then save.</p>
                  </>
                ) : null}
              </div>
              {FIELDS.map((field) => (
                <label key={field.key} className="col-span-2 flex min-w-0 flex-col gap-1.5 @4xl:col-span-1 @4xl:row-start-1">
                  <span className={cn(COLUMN_LABEL_CLASS, "@4xl:sr-only")}>
                    {field.label}
                    <span className="sr-only"> {title}</span>
                  </span>
                  <Input
                    type="date"
                    value={year[field.key] ?? ""}
                    onChange={(event) => change(index, field.key, event.target.value)}
                    className="w-full font-mono tabular-nums"
                  />
                </label>
              ))}
              <div className="col-start-2 row-start-1 flex justify-end @4xl:col-start-6">
                {years.length > 1 ? (
                  <RemoveButton
                    label={`Remove ${title}`}
                    size="md"
                    onClick={() => setYears((current) => current.filter((_, at) => at !== index))}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 md:px-5">
        <Button type="button" variant="outline" onClick={addYear} className="max-sm:w-full">
          <Plus aria-hidden="true" />
          Add a school year
        </Button>
        {/* Always enabled: a year read from Paly's calendar is confirmed by saving it unchanged. Outline,
            like every other Save on Admin (the one filled button is the header's Add person). */}
        <Button type="button" variant="outline" disabled={saving} onClick={() => void save()} className="max-sm:w-full">
          {saving ? "Saving…" : "Save school years"}
        </Button>
      </div>
    </div>
  );
}
