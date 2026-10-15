"use client";

import { useState, type FormEvent } from "react";
import { Check, Save } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { InlineError } from "@/components/kit/alert";
import { fieldLabelClass } from "@/components/kit/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_CYCLES, MIN_CYCLES, clampCycleCount, errorMessage, parseCycleCount } from "./cycle-dates-utils";
import { postData } from "./post-data";

/**
 * Edit mode, executive producers and up: how many cycles the semester has (1–8). The field
 * clamps as you type (as before), and the form skips browser validation so Enter always saves
 * the clamped value. The reload after a save is the page's job (`onSaved`); its errors show there.
 * It lays out by its own width (`@container/strip`): one row across the page, stacked in the
 * wide-screen side rail and on phones.
 */
export function SemesterStrip({ savedCount, onSaved }: { savedCount: number; onSaved: (count: number) => Promise<void> }) {
  const [text, setText] = useState(String(savedCount));
  const [syncedCount, setSyncedCount] = useState(savedCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // A new saved count (after a save or a refresh) resets the field.
  if (syncedCount !== savedCount) {
    setSyncedCount(savedCount);
    setText(String(savedCount));
  }

  const draft = parseCycleCount(text);
  const dirty = draft !== null && draft !== savedCount;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || draft === savedCount) {
      setText(String(draft ?? savedCount));
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const result = await postData<{ cyclesPerSemester: number }>(
        "/api/platform/program-settings",
        { cyclesPerSemester: draft },
        "Failed to update cycle count."
      );
      const count = result.cyclesPerSemester;
      setSavedMessage(`Semester now has ${count} package cycle${count === 1 ? "" : "s"}.`);
      await onSaved(count);
    } catch (saveError) {
      setError(errorMessage(saveError, "Failed to update cycle count."));
      setText(String(savedCount));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      aria-labelledby="cycles-per-semester-label"
      onSubmit={(event) => void submit(event)}
      className="@container/strip space-y-2 rounded-md border border-border bg-card p-4"
    >
      <label id="cycles-per-semester-label" htmlFor="cycles-per-semester" className={fieldLabelClass}>
        Cycles this semester
      </label>
      <div className="flex flex-col gap-3 @min-[36rem]/strip:flex-row @min-[36rem]/strip:items-center @min-[36rem]/strip:gap-5">
        <p
          id="cycles-per-semester-hint"
          className="min-w-0 text-[13px] leading-snug text-muted-foreground @min-[36rem]/strip:order-last"
        >
          Sets how many cycles show here and in grades. Lowering it hides the extra cycles but keeps their dates.
        </p>
        <ActionBar size="touch" className="shrink-0 flex-nowrap @max-[36rem]/strip:w-full">
          <Input
            id="cycles-per-semester"
            type="number"
            inputMode="numeric"
            min={MIN_CYCLES}
            max={MAX_CYCLES}
            value={text}
            onChange={(event) => {
              const value = event.target.value;
              // Same rule as before: whole numbers from 1 to 8, clamped on every change.
              setText(value.trim() === "" ? "" : String(clampCycleCount(Number(value))));
              setSavedMessage(null);
            }}
            onBlur={() => setText(String(draft ?? savedCount))}
            aria-describedby="cycles-per-semester-hint"
            className="w-20 font-mono-broadcast tabular-nums"
          />
          <span className="inline-flex items-center text-sm text-muted-foreground">cycles</span>
          <Button type="submit" variant="outline" disabled={!dirty || saving} className="@max-[36rem]/strip:ml-auto">
            <Save aria-hidden />
            {saving ? "Saving…" : "Save count"}
          </Button>
        </ActionBar>
      </div>
      {error ? <InlineError>Couldn&apos;t update the cycle count. {error}</InlineError> : null}
      {!error && savedMessage && !dirty ? (
        <p role="status" className="flex items-center gap-1.5 text-[13px] leading-snug text-muted-foreground">
          <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--brand-green)]" />
          {savedMessage}
        </p>
      ) : null}
    </form>
  );
}
