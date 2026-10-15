"use client";

import type { RefObject } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { KeyHints, shortcutKeys } from "@/components/kit/kbd";
import { SectionLabel } from "@/components/kit/section";
import { useIsApplePlatform } from "@/components/people/people-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { MEMBER_GENERAL_CYCLE_NUMBER, memberNoteKey } from "@/src/lib/member-notes";
import { cn } from "@/src/lib/utils";
import { type CycleTab, type MemberRow, type NoteMap, cycleCode, missingCyclesText, personLabel, tabTitle } from "./member-notes-model";
import { type EditorHandlers, NoteEditor, notesLabel, notesPlaceholder } from "./note-editor";

const stepClass = cn(buttonVariants({ variant: "outline", size: "icon" }), "h-full w-auto aspect-square px-0");

/** Previous / next member, joined (h-8 beside the name on lg, h-10 in the phone bar). */
export function MemberStepper({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  className
}: {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Previous and next member"
      className={cn(
        "inline-flex shrink-0 items-stretch *:relative *:rounded-none *:focus-visible:z-10 [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*:not(:first-child)]:-ml-px",
        className
      )}
    >
      <button type="button" aria-label="Previous member" title="Previous member (K)" onClick={onPrevious} disabled={!hasPrevious} className={stepClass}>
        <ChevronUp aria-hidden />
      </button>
      <button type="button" aria-label="Next member" title="Next member (J)" onClick={onNext} disabled={!hasNext} className={stepClass}>
        <ChevronDown aria-hidden />
      </button>
    </div>
  );
}

/**
 * The selected person: name and email, the active tab's note as the main field, and beside it
 * (below it on narrow panes) their standing General note plus every other cycle's note to read,
 * each with "Open" to switch the page to that cycle.
 */
export function MemberDetail({
  member,
  cycles,
  activeTab,
  drafts,
  handlers,
  primaryRef,
  onSaveAndNext,
  onOpenCycle,
  stepper
}: {
  member: MemberRow;
  cycles: CycleTab[];
  activeTab: number;
  drafts: NoteMap;
  handlers: EditorHandlers;
  primaryRef: RefObject<HTMLTextAreaElement | null>;
  onSaveAndNext: () => void;
  /** Switches the page to that cycle, keeping this person selected. */
  onOpenCycle: (cycleNumber: number) => void;
  stepper: { onPrevious: () => void; onNext: () => void; hasPrevious: boolean; hasNext: boolean };
}) {
  const apple = useIsApplePlatform();
  const name = personLabel(member);
  const isGeneral = activeTab === MEMBER_GENERAL_CYCLE_NUMBER;
  const activeCycle = cycles.find((cycle) => cycle.cycleNumber === activeTab) ?? null;
  const noteFor = (cycleNumber: number) => drafts[memberNoteKey(member.id, cycleNumber)] ?? "";
  const otherCycles = cycles.filter((cycle) => cycle.cycleNumber !== activeTab);
  const withNotes = otherCycles.filter((cycle) => noteFor(cycle.cycleNumber).trim());
  const empty = otherCycles.filter((cycle) => !noteFor(cycle.cycleNumber).trim());

  return (
    <section aria-labelledby="member-detail-name" className="@container min-w-0 space-y-5 rounded-md border border-border bg-card p-4 md:p-5">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="member-detail-name" className="truncate text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
            {name}
          </h2>
          {member.email ? (
            <p className="truncate font-mono-broadcast text-xs text-muted-foreground">{member.email}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <KeyHints items={[{ keys: ["K", "J"], label: "Previous / next" }]} />
          <MemberStepper {...stepper} className="h-8" />
        </div>
      </header>

      <div className="grid min-w-0 gap-5 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-2">
          <NoteEditor
            key={`${member.id}:${activeTab}`}
            noteKey={memberNoteKey(member.id, activeTab)}
            label={tabTitle(activeTab)}
            focus={activeCycle?.focus?.trim() || undefined}
            srLabel={notesLabel(activeTab, name)}
            placeholder={notesPlaceholder(activeTab)}
            value={noteFor(activeTab)}
            size="lg"
            textareaRef={primaryRef}
            onSaveAndNext={stepper.hasNext ? onSaveAndNext : undefined}
            handlers={handlers}
          />
          <KeyHints
            items={[
              ...(stepper.hasNext ? [{ keys: shortcutKeys("mod+enter", apple), label: "Save and go to next" }] : []),
              { keys: ["Esc"], label: "Done" }
            ]}
          />
        </div>

        {!isGeneral || otherCycles.length > 0 ? (
          <aside aria-label={`More notes for ${name}`} className="min-w-0 space-y-5 @3xl:border-l @3xl:border-border @3xl:pl-5">
            {!isGeneral ? (
              <NoteEditor
                noteKey={memberNoteKey(member.id, MEMBER_GENERAL_CYCLE_NUMBER)}
                label="General"
                srLabel={notesLabel(MEMBER_GENERAL_CYCLE_NUMBER, name)}
                placeholder={notesPlaceholder(MEMBER_GENERAL_CYCLE_NUMBER)}
                value={noteFor(MEMBER_GENERAL_CYCLE_NUMBER)}
                size="md"
                handlers={handlers}
              />
            ) : null}

            {otherCycles.length > 0 ? (
              <section aria-label={isGeneral ? "Cycles" : "Other cycles"} className="min-w-0">
                <SectionLabel as="h3">{isGeneral ? "Cycles" : "Other cycles"}</SectionLabel>
                <div className="divide-y divide-border">
                  {withNotes.map((cycle) => (
                    <div key={cycle.cycleNumber} className="min-w-0 py-3">
                      <div className="flex min-h-8 min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
                          Cycle {cycleCode(cycle.cycleNumber)}
                        </span>
                        {cycle.focus?.trim() ? (
                          <span className="min-w-0 truncate text-[13px] text-muted-foreground">{cycle.focus}</span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-10 shrink-0 md:h-8"
                          aria-label={`Open cycle ${cycle.cycleNumber} notes for ${name}`}
                          onClick={() => onOpenCycle(cycle.cycleNumber)}
                        >
                          Open
                        </Button>
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-[var(--ink-text)]">
                        {noteFor(cycle.cycleNumber)}
                      </p>
                    </div>
                  ))}
                  {empty.length > 0 ? (
                    <p className="py-3 text-[13px] text-muted-foreground">
                      {missingCyclesText(empty.map((cycle) => cycle.cycleNumber))}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
