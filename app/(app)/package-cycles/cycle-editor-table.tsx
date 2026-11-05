"use client";

import type { FormEvent } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
import { SaveState } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";
import { STAGE_FIELDS, earlierThanStage, stageHint } from "./cycle-dates-utils";
import type { EditorActions, EditorRow } from "./cycle-editor";
import { CURRENT_TINT, ClosedGroupRow, CurrentBar, CycleName, ScheduleColumns, ScheduleHead } from "./cycle-parts";

/** Cycle, five stages and Save. */
const COLUMN_COUNT = STAGE_FIELDS.length + 2;

/** Row rules sit on the cells (this table separates its borders). */
const ROW_RULE = "border-t border-border";

/**
 * One cycle as a table row: its date fields belong to a form that lives in the Save cell (the
 * `form` attribute), so Enter in any of them saves this cycle.
 */
function EditorTableRow({ row, today, onChange, onSave }: { row: EditorRow; today: Date } & EditorActions) {
  const { draft, saved, section, dirty, saving, saveState, error } = row;
  const cycleNumber = draft.cycleNumber;
  const formId = `cycle-${cycleNumber}-row-form`;
  const current = section === "current";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirty && !saving) onSave(draft);
  }

  return (
    <>
      <tr className={cn(current && CURRENT_TINT)}>
        <th scope="row" className={cn(ROW_RULE, "relative py-3 pl-4 pr-3 text-left align-top font-normal")}>
          {current ? <CurrentBar /> : null}
          <CycleName cycle={saved ?? draft} section={section} tags={<SaveState state={saveState} />} />
        </th>
        {STAGE_FIELDS.map((stage, index) => {
          const hintId = `cycle-${cycleNumber}-${stage.key}-row-hint`;
          const earlier = earlierThanStage(draft, index);
          return (
            <td key={stage.key} className={cn(ROW_RULE, "px-2.5 py-3 align-top")}>
              <Input
                form={formId}
                type="date"
                aria-label={`Cycle ${cycleNumber} ${stage.label}`}
                aria-describedby={hintId}
                value={draft[stage.key] ?? ""}
                onChange={(event) => onChange(cycleNumber, stage.key, event.target.value ? event.target.value : null)}
                className="h-8 px-2"
              />
              <p id={hintId} className="mt-1 text-xs leading-5 text-muted-foreground">
                {earlier ? (
                  <span title={`Earlier than ${earlier.label}`} className="flex items-start gap-1 text-[var(--brand-amber)]">
                    <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span aria-hidden>Before {earlier.short}</span>
                    <span className="sr-only">Earlier than {earlier.label}</span>
                  </span>
                ) : (
                  <span className="font-mono-broadcast tabular-nums">{stageHint(draft[stage.key], today)}</span>
                )}
              </p>
            </td>
          );
        })}
        <td className={cn(ROW_RULE, "py-3 pl-2 pr-4 text-right align-top")}>
          <form id={formId} onSubmit={submit}>
            <Button type="submit" size="sm" variant="outline" disabled={!dirty || saving}>
              {saving ? <Spinner /> : <Save aria-hidden />}
              Save<span className="sr-only"> Cycle {cycleNumber}</span>
            </Button>
          </form>
        </td>
      </tr>
      {error ? (
        <tr className={cn(current && CURRENT_TINT)}>
          <td colSpan={COLUMN_COUNT} className="p-0">
            <div className="relative px-4 pb-3">
              {current ? <CurrentBar /> : null}
              <Alert tone="danger" compact>
                Couldn&apos;t save Cycle {cycleNumber}. {error}
              </Alert>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * The editor on wide screens: the read view's table, with a date field in every stage cell. It is
 * at least 64rem wide so every date field keeps its width; the editor only shows it in a box that
 * fits it (EDITOR_TABLE_ONLY), so it does not scroll.
 */
export function EditorTable({
  open,
  closed,
  today,
  onChange,
  onSave
}: { open: EditorRow[]; closed: EditorRow[]; today: Date } & EditorActions) {
  return (
    <table className="w-full min-w-[64rem] table-fixed border-separate border-spacing-0 text-sm">
      <caption className="sr-only">Edit stage dates by cycle</caption>
      <ScheduleColumns withActions />
      <ScheduleHead actionsLabel="Save" />
      {open.length > 0 ? (
        <tbody>
          {open.map((row) => (
            <EditorTableRow key={row.draft.cycleNumber} row={row} today={today} onChange={onChange} onSave={onSave} />
          ))}
        </tbody>
      ) : null}
      {closed.length > 0 ? (
        <tbody>
          <ClosedGroupRow count={closed.length} colSpan={COLUMN_COUNT} />
          {closed.map((row) => (
            <EditorTableRow key={row.draft.cycleNumber} row={row} today={today} onChange={onChange} onSave={onSave} />
          ))}
        </tbody>
      ) : null}
    </table>
  );
}
