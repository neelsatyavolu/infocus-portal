"use client";

import { useId } from "react";
import { ChevronDown, Image as ImageIcon, ImageOff, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { NamePicker } from "@/components/name-picker";
import { Button } from "@/components/ui/button";
import {
  CREW_LABELS,
  NOTES_TEXT_STYLES,
  type Anchor,
  type DayModel
} from "@/components/master-calendar/calendar-model";
import {
  BirthdaysSection,
  DaySection,
  NAME_CHIP_CLASS,
  QueueSection,
  ScenicPreview,
  SpiritThemeLine
} from "@/components/master-calendar/day-sections";
import { EditableHtmlBlock } from "@/components/master-calendar/editable-html-block";
import type { CalendarCrewRole } from "@/src/lib/calendar-show-content";
import { cn } from "@/src/lib/utils";

/** Section actions are 32px with a mouse and 40px on touch screens. */
const SECTION_ACTION = "pointer-coarse:h-10";

/** NamePicker's own trigger box (h-9, like Input), 40px on touch screens. */
const PICKER_TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-left text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-10";

/**
 * A name slot's trigger, named for screen readers by its slot ("Anchor 1: Abby"). Returned as a
 * plain <button> element, since NamePicker's Radix trigger merges its props onto it.
 */
function pickerTrigger(slotLabel: string, value: string) {
  return (
    <button type="button" aria-label={`${slotLabel}: ${value || "not set"}`} className={PICKER_TRIGGER}>
      <span className={cn("truncate", !value && "text-muted-foreground")}>{value || slotLabel}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
    </button>
  );
}

export type DayEditActions = {
  saveShowAnchors: (dateKey: string, names: string[], source: "manual" | "random") => void;
  randomizeShowAnchors: (dateKey: string) => void;
  saveShowManager: (dateKey: string, name: string) => void;
  savePaAnnouncers: (dateKey: string, names: string[]) => void;
  randomizePaAnnouncers: (dateKey: string) => void;
  saveCrew: (dateKey: string, role: CalendarCrewRole, names: string[]) => void;
  toggleImage: (dateKey: string) => void;
  commitNotes: (dateKey: string, html: string) => void | Promise<void>;
  registerEditor: (dateKey: string, element: HTMLDivElement) => void;
  openPackagePicker: (dateKey: string, anchor: Anchor) => void;
  openPillRename: (dateKey: string, pill: HTMLElement, anchor: Anchor) => void;
};

function optionsForValue(members: string[], value: string) {
  return !value || members.includes(value) ? members : [value, ...members];
}

function RandomizeButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClick} aria-label={label} title={label} className={SECTION_ACTION}>
      <Sparkles aria-hidden />
      Randomize
    </Button>
  );
}

/** Two name slots (anchors or PA announcers); a slot can't pick the other slot's name. */
function PairPickers({
  dateKey,
  names,
  members,
  busy,
  labelledBy,
  placeholder,
  onChange
}: {
  dateKey: string;
  names: string[];
  members: string[];
  busy: boolean;
  /** The section heading's id, which names the pair. */
  labelledBy: string;
  placeholder: (slot: number) => string;
  onChange: (next: string[]) => void;
}) {
  const first = names[0] ?? "";
  const second = names[1] ?? "";
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid gap-2">
      {[0, 1].map((slot) => {
        const value = slot === 0 ? first : second;
        return (
          <NamePicker
            key={`${dateKey}-${slot}`}
            value={value}
            options={members}
            disabledOptions={[slot === 0 ? second : first]}
            disabled={busy}
            placeholder={placeholder(slot)}
            onChange={(nextValue) => onChange(slot === 0 ? [nextValue, second] : [first, nextValue])}
            trigger={pickerTrigger(placeholder(slot), value)}
          />
        );
      })}
    </div>
  );
}

function CrewChips({
  role,
  names,
  members,
  busy,
  onChange
}: {
  role: CalendarCrewRole;
  names: string[];
  members: string[];
  busy: boolean;
  onChange: (next: string[]) => void;
}) {
  const { label, add } = CREW_LABELS[role];
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{label}</h4>
      {!add ? <p className="text-xs text-muted-foreground">Add each person to a list below to sort them.</p> : null}
      <ul className="flex flex-wrap items-center gap-1.5">
        {names.map((name) => (
          <li key={name} className={cn(NAME_CHIP_CLASS, "pr-0 pointer-coarse:h-10")}>
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              title={`Remove ${name}`}
              disabled={busy}
              onClick={() => onChange(names.filter((entry) => entry !== name))}
              className="ml-0.5 grid h-8 w-8 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--ink-4)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:w-10"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
        {add ? (
          <li>
            <NamePicker
              value=""
              options={members}
              disabledOptions={names}
              disabled={busy}
              placeholder={add}
              onChange={(name) => {
                if (name) onChange([...names, name]);
              }}
              trigger={
                <Button type="button" variant="ghost" size="sm" aria-label={add} title={add} className={SECTION_ACTION}>
                  <Plus aria-hidden />
                  Add
                </Button>
              }
            />
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * The producer's editing sections for one day: cast pickers with Randomize, show manager with
 * Use rotation, the queue, Spirit Week crew chips, the scenic image switch and the notes field. Loaded
 * only for producers.
 */
export default function DayEditSections({
  day,
  busy,
  wipingAnchors,
  members,
  managerPool,
  actions
}: {
  day: DayModel;
  busy: boolean;
  wipingAnchors: boolean;
  members: string[];
  managerPool: string[];
  actions: DayEditActions;
}) {
  const idBase = useId();
  const notesHintId = `${idBase}-notes-hint`;
  const castHeadingId = `${idBase}-cast`;
  const { dateKey } = day;
  const showBusy = busy || wipingAnchors;
  const manager = day.manager?.name ?? "";

  return (
    <>
      <BirthdaysSection day={day} />

      {day.kind === "SHOW" ? (
        <>
          <DaySection
            label="Anchors"
            labelId={castHeadingId}
            end={<RandomizeButton label="Randomize anchors" busy={showBusy} onClick={() => actions.randomizeShowAnchors(dateKey)} />}
          >
            <PairPickers
              dateKey={dateKey}
              names={day.anchors}
              members={members}
              busy={showBusy}
              labelledBy={castHeadingId}
              placeholder={(slot) => `Anchor ${slot + 1}`}
              onChange={(next) => actions.saveShowAnchors(dateKey, next, "manual")}
            />
          </DaySection>
          <DaySection
            label="Show manager"
            end={
              day.manager?.source === "manual" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={showBusy}
                  onClick={() => actions.saveShowManager(dateKey, "")}
                  title="Clear the override and go back to the rotation"
                  className={SECTION_ACTION}
                >
                  <RotateCcw aria-hidden />
                  Use rotation
                </Button>
              ) : (
                <StatusTag tone="success" title="From the rotation">
                  Auto
                </StatusTag>
              )
            }
          >
            <NamePicker
              value={manager}
              options={optionsForValue(managerPool, manager)}
              disabled={showBusy}
              placeholder="Show manager"
              onChange={(name) => actions.saveShowManager(dateKey, name)}
              trigger={pickerTrigger("Show manager", manager)}
            />
          </DaySection>
          <QueueSection day={day} />
        </>
      ) : null}

      {day.kind === "PA" ? (
        <DaySection
          label="PA announcers"
          labelId={castHeadingId}
          end={<RandomizeButton label="Randomize PA announcers" busy={busy} onClick={() => actions.randomizePaAnnouncers(dateKey)} />}
        >
          <PairPickers
            dateKey={dateKey}
            names={day.paNames}
            members={members}
            busy={busy}
            labelledBy={castHeadingId}
            placeholder={(slot) => `Announcer ${slot + 1}`}
            onChange={(next) => actions.savePaAnnouncers(dateKey, next)}
          />
        </DaySection>
      ) : null}

      {day.spirit ? (
        <DaySection label="Spirit Week">
          <div className="space-y-4">
            <SpiritThemeLine theme={day.spirit.theme} />
            {day.spirit.unsorted.length > 0 ? (
              <CrewChips
                role="Filmers"
                names={day.spirit.unsorted}
                members={members}
                busy={busy}
                onChange={(names) => actions.saveCrew(dateKey, "Filmers", names)}
              />
            ) : null}
            {day.spirit.lists.map((list) => (
              <CrewChips
                key={list.role}
                role={list.role}
                names={list.names}
                members={members}
                busy={busy}
                onChange={(names) => actions.saveCrew(dateKey, list.role, names)}
              />
            ))}
          </div>
        </DaySection>
      ) : null}

      {day.kind === "NONE" ? (
        <DaySection label="Scenic image" end={day.imageHidden ? <StatusTag tone="muted">Image off</StatusTag> : null}>
          <div className="space-y-2">
            <ScenicPreview day={day} />
            <Button type="button" variant="outline" size="sm" onClick={() => actions.toggleImage(dateKey)} className={SECTION_ACTION}>
              {day.imageHidden ? <ImageIcon aria-hidden /> : <ImageOff aria-hidden />}
              {day.imageHidden ? "Restore image" : "Delete image"}
            </Button>
          </div>
        </DaySection>
      ) : null}

      {day.kind === "NONE" || day.kind === "HOLIDAY" ? (
        <DaySection label="Notes">
          <EditableHtmlBlock
            html={day.editorHtml}
            ariaLabel="Notes"
            placeholder="Add a note"
            describedBy={notesHintId}
            onCommit={(html) => actions.commitNotes(dateKey, html)}
            onEditorFocus={(element) => actions.registerEditor(dateKey, element)}
            onPackageTrigger={(anchor) => actions.openPackagePicker(dateKey, anchor)}
            onPillClick={(pill, anchor) => actions.openPillRename(dateKey, pill, anchor)}
            className={cn(
              NOTES_TEXT_STYLES,
              "min-h-24 rounded-md border border-input bg-background p-3 text-base outline-none sm:text-sm focus-visible:ring-2 focus-visible:ring-ring",
              "[&_.package-pill]:cursor-pointer empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
            )}
          />
          <p id={notesHintId} className="text-xs text-muted-foreground">
            Type [package] to add a package pill. Click a pill to rename or remove it.
          </p>
        </DaySection>
      ) : null}
    </>
  );
}
