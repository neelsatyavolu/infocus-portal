"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Disclosure } from "@/components/kit/disclosure";
import { Field } from "@/components/kit/field";
import { PanelFooter, PanelHeader } from "@/components/kit/panel";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";
import {
  SECTION_LABEL,
  SECTION_TONE,
  STAGE_FIELDS,
  cycleTitle,
  earlierThanStage,
  errorMessage,
  isDirty,
  stageHint,
  type CycleSection,
  type PackageCycle,
  type StageKey
} from "./cycle-dates-utils";
import { EditorTable } from "./cycle-editor-table";
import {
  CLOSED_CYCLES_STORAGE_KEY,
  DATES_CONTAINER,
  EDITOR_CARDS_ONLY,
  EDITOR_TABLE_ONLY,
  SemesterTag
} from "./cycle-parts";
import { postData } from "./post-data";

const CONTROL = "h-10 md:h-9";

/** Equal-height form cards: stacked on phones, two across from 30rem, three from 48rem. */
const CARD_GRID = "grid gap-4 @min-[30rem]/dates:grid-cols-2 @min-[48rem]/dates:grid-cols-3";

/** One cycle as the editor shows it (the table row and the card read the same model). */
export type EditorRow = {
  draft: PackageCycle;
  saved: PackageCycle | undefined;
  section: CycleSection;
  dirty: boolean;
  saving: boolean;
  saveState: SaveStateValue;
  error: string | null;
};

export type EditorActions = {
  onChange: (cycleNumber: number, key: StageKey, value: string | null) => void;
  /** Saves the full draft (Enter in any date field, or the Save button). */
  onSave: (draft: PackageCycle) => void;
};

/** One cycle's five dates as a form card (where the editor table doesn't fit). Enter in a field saves. */
function CycleEditorCard({ row, today, onChange, onSave }: { row: EditorRow; today: Date } & EditorActions) {
  const { draft, saved, section, dirty, saving, saveState, error } = row;
  const titleId = `cycle-${draft.cycleNumber}-edit-title`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirty && !saving) onSave(draft);
  }

  return (
    <form
      aria-labelledby={titleId}
      onSubmit={submit}
      className="flex h-full min-w-0 flex-col rounded-md border border-border bg-card text-card-foreground"
    >
      <PanelHeader
        titleAs="h3"
        titleId={titleId}
        title={cycleTitle(saved ?? draft)}
        status={
          <>
            <StatusTag tone={SECTION_TONE[section]}>{SECTION_LABEL[section]}</StatusTag>
            <SemesterTag cycleNumber={draft.cycleNumber} />
            <SaveState state={saveState} />
          </>
        }
        className="px-4 pt-4"
      />
      <div className="flex-1 space-y-3 p-4">
        {STAGE_FIELDS.map((stage, index) => {
          const id = `cycle-${draft.cycleNumber}-${stage.key}`;
          const earlier = earlierThanStage(draft, index);
          return (
            <Field
              key={stage.key}
              label={stage.label}
              htmlFor={id}
              hint={
                <>
                  <span className="font-mono-broadcast text-xs tabular-nums">{stageHint(draft[stage.key], today)}</span>
                  {earlier ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[var(--brand-amber)]">
                      <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      Earlier than {earlier.label}
                    </span>
                  ) : null}
                </>
              }
            >
              <Input
                id={id}
                type="date"
                value={draft[stage.key] ?? ""}
                onChange={(event) => onChange(draft.cycleNumber, stage.key, event.target.value ? event.target.value : null)}
                aria-describedby={`${id}-hint`}
                className={CONTROL}
              />
            </Field>
          );
        })}
        {error ? (
          <Alert tone="danger" compact>
            Couldn&apos;t save Cycle {draft.cycleNumber}. {error}
          </Alert>
        ) : null}
      </div>
      <PanelFooter justify="end" className="md:px-4">
        <Button type="submit" variant="outline" disabled={!dirty || saving} className={CONTROL}>
          <Save aria-hidden />
          {saving ? "Saving…" : "Save cycle"}
        </Button>
      </PanelFooter>
    </form>
  );
}

type CycleEditorProps = {
  saved: PackageCycle[];
  /** Drafts in edit-layout order (see editRows). */
  rows: { open: PackageCycle[]; closed: PackageCycle[] };
  sections: Map<number, CycleSection>;
  today: Date;
  /** Cycles whose save is running; the page holds this so Done editing waits for them. */
  savingCycles: number[];
  onSavingChange: (cycleNumber: number, saving: boolean) => void;
  onChange: (cycleNumber: number, key: StageKey, value: string | null) => void;
  onSaved: (result: PackageCycle, sent: PackageCycle) => void;
};

/**
 * Where the whole 64rem table fits (EDITOR_TABLE_ONLY), edit mode is the read view's table with a
 * date field in each cell, so a cycle keeps its row when you start editing. Narrower, one form
 * card per cycle (CARD_GRID). As in the read view, closed cycles sit under a "Closed" label in the
 * table and fold under the same remembered "Closed cycles" disclosure in the cards.
 */
export function CycleEditor({ saved, rows, sections, today, savingCycles, onSavingChange, onChange, onSaved }: CycleEditorProps) {
  const [justSaved, setJustSaved] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});

  function change(cycleNumber: number, key: StageKey, value: string | null) {
    setJustSaved((current) => current.filter((entry) => entry !== cycleNumber));
    onChange(cycleNumber, key, value);
  }

  async function save(cycle: PackageCycle) {
    const { cycleNumber } = cycle;
    onSavingChange(cycleNumber, true);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== cycleNumber)));
    try {
      // The full draft, focus included: the server overwrites every field it is sent.
      const result = await postData<PackageCycle>("/api/package-cycles", cycle, "Failed to save cycle.");
      onSaved(result, cycle);
      setJustSaved((current) => [...current.filter((entry) => entry !== cycleNumber), cycleNumber]);
    } catch (error) {
      setErrors((current) => ({ ...current, [cycleNumber]: errorMessage(error, "Failed to save cycle.") }));
    } finally {
      onSavingChange(cycleNumber, false);
    }
  }

  function toRow(draft: PackageCycle): EditorRow {
    const savedCycle = saved.find((entry) => entry.cycleNumber === draft.cycleNumber);
    const dirty = isDirty(draft, savedCycle);
    const saving = savingCycles.includes(draft.cycleNumber);
    const error = errors[draft.cycleNumber] ?? null;
    return {
      draft,
      saved: savedCycle,
      section: sections.get(draft.cycleNumber) ?? "upcoming",
      dirty,
      saving,
      saveState: saving ? "saving" : error ? "error" : dirty ? "dirty" : justSaved.includes(draft.cycleNumber) ? "saved" : "idle",
      error
    };
  }

  const open = rows.open.map(toRow);
  const closed = rows.closed.map(toRow);
  const actions: EditorActions = { onChange: change, onSave: (draft) => void save(draft) };

  return (
    <div className={DATES_CONTAINER}>
      <div className={cn(EDITOR_TABLE_ONLY, "overflow-x-auto overscroll-x-contain rounded-md border border-border bg-card")}>
        <EditorTable open={open} closed={closed} today={today} {...actions} />
      </div>
      <div className={cn("space-y-4", EDITOR_CARDS_ONLY)}>
        {open.length > 0 ? (
          <div className={CARD_GRID}>
            {open.map((row) => (
              <CycleEditorCard key={row.draft.cycleNumber} row={row} today={today} {...actions} />
            ))}
          </div>
        ) : null}
        {closed.length > 0 ? (
          <Disclosure summary="Closed cycles" count={closed.length} storageKey={CLOSED_CYCLES_STORAGE_KEY}>
            <div className={CARD_GRID}>
              {closed.map((row) => (
                <CycleEditorCard key={row.draft.cycleNumber} row={row} today={today} {...actions} />
              ))}
            </div>
          </Disclosure>
        ) : null}
      </div>
    </div>
  );
}
