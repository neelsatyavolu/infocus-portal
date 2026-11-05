"use client";

import { useCallback, useId, useMemo, useRef } from "react";
import { ChevronsDownUp, ChevronsUpDown, ListPlus, Monitor, PanelLeftOpen, Plus, Sparkles } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { EmptyState } from "@/components/kit/empty-state";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu } from "@/components/kit/menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/lib/utils";
import {
  formatAge,
  formatShowDateLong,
  latestDocUpdate,
  pluralize,
  primaryDocStatus,
  sectionStatus,
  sectionUpdatedAt,
  splitSectionLabel,
  type DocStatusContext,
  type ReformatState,
  type SectionDraft,
  type TeleprompterDoc,
  type TeleprompterSection,
  type WorkspaceLayout
} from "./teleprompter-model";
import { DocStatusTag, PANE_HEADER_HEIGHT, ProgressEdge, ReformattingTag, STICKY_TOP } from "./teleprompter-parts";
import { ExpandAllToggle, RundownColumn, RundownStrip, type RundownItem } from "./teleprompter-rundown";
import { NewSectionBlock, SectionBlock, type SectionEditorProps } from "./teleprompter-section-block";
import { ScriptSwitcherCard } from "./teleprompter-script-rail";

export type SectionEditorState = {
  open: boolean;
  draft: SectionDraft;
  dirty: boolean;
};

export type ScriptDetailHandlers = {
  onToggleSection: (sectionId: string) => void;
  onExpandSection: (sectionId: string) => void;
  onSetAllCollapsed: (collapsed: boolean) => void;
  onAddSection: () => void;
  onEditSection: (section: TeleprompterSection) => void;
  onDraftChange: (draft: SectionDraft) => void;
  onSaveDraft: () => void;
  onCancelDraft: () => void;
  onRequestDiscardDraft: () => void;
  onCopySection: (section: TeleprompterSection) => void;
  onReformatSection: (section: TeleprompterSection) => void;
  onRefetchSection: (section: TeleprompterSection) => void;
  onDeleteSection: (sectionId: string) => void;
  onReformatDoc: () => void;
  onRun: () => void;
  onShowRail: () => void;
  onOpenScripts: () => void;
};

export type ScriptDetailView = {
  doc: TeleprompterDoc;
  layout: WorkspaceLayout;
  railCollapsed: boolean;
  canEdit: boolean;
  working: boolean;
  now: number;
  statusContext: DocStatusContext;
  reformatState: ReformatState;
  collapsedSections: Record<string, boolean>;
  copiedSectionId: string | null;
  editor: SectionEditorState;
  sectionUpdatedSinceVisit: (section: TeleprompterSection) => boolean;
};

function scrollParent(node: HTMLElement) {
  let current = node.parentElement;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Scrolls so `target` sits just under the sticky band. Measured instead of scroll-margin, so it
 * works on both hosts (AppShell scrolls its own box with scroll padding; the teleprompter host
 * scrolls the window). Never touches the URL: any search-param change reloads the scripts.
 */
function scrollUnderBand(target: HTMLElement, band: HTMLElement | null, onlyIfHidden = false) {
  const scroller = scrollParent(target);
  const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const stickyTop = band ? Number.parseFloat(window.getComputedStyle(band).top) || 0 : 0;
  const bandBottom = scrollerTop + stickyTop + (band?.offsetHeight ?? 0);
  const targetTop = target.getBoundingClientRect().top;
  if (onlyIfHidden && targetTop >= bandBottom && targetTop < window.innerHeight - 96) {
    return;
  }
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  (scroller ?? window).scrollBy({ top: targetTop - bandBottom - 8, behavior });
}

/**
 * The one filled button. Unavailable (drawn as outline) with no sections or while an edit is
 * open, since run mode shows saved text. aria-disabled instead of disabled, so it stays
 * focusable and its tooltip and description still say why.
 */
function RunButton({ disabledReason, onRun }: { disabledReason: string | null; onRun: () => void }) {
  const reasonId = useId();
  const unavailable = Boolean(disabledReason);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={unavailable ? "outline" : "default"}
          aria-disabled={unavailable || undefined}
          aria-describedby={unavailable ? reasonId : undefined}
          onClick={unavailable ? undefined : onRun}
          className={cn("shrink-0", unavailable && "cursor-not-allowed opacity-50 hover:bg-transparent")}
        >
          <Monitor />
          Run
          {unavailable ? (
            <span id={reasonId} hidden>
              {disabledReason}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{disabledReason ?? "Run full screen (R)"}</TooltipContent>
    </Tooltip>
  );
}

function DetailMeta({ doc, now, statusContext, docProgress }: { doc: TeleprompterDoc; now: number; statusContext: DocStatusContext; docProgress: number | null }) {
  const date = formatShowDateLong(doc.showDate);
  const age = formatAge(latestDocUpdate(doc), now);
  const status = primaryDocStatus(doc, statusContext);
  const headerStatus = status && (status.kind === "today" || status.kind === "next-show") ? status : null;
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs leading-5 text-muted-foreground">
      <p className="min-w-0 truncate">
        {date ? (
          <>
            <span className="font-mono-broadcast tabular-nums">{date}</span>
            {" · "}
          </>
        ) : null}
        {pluralize(doc.sections.length, "section")}
        {age ? (
          <>
            {" · Updated "}
            <span className="font-mono-broadcast tabular-nums">{age}</span>
          </>
        ) : null}
      </p>
      {headerStatus ? <DocStatusTag status={headerStatus} size="sm" /> : null}
      {docProgress !== null ? <ReformattingTag progress={docProgress} /> : null}
    </div>
  );
}

export function ScriptDetail({ view, handlers }: { view: ScriptDetailView; handlers: ScriptDetailHandlers }) {
  const { doc, layout, canEdit, working, editor, reformatState, collapsedSections, now, sectionUpdatedSinceVisit } = view;
  const bandRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const narrow = layout.mode === "narrow";
  const docProgress = reformatState.scope === "doc" && reformatState.targetId === doc.id ? reformatState.progress : null;
  const editingId = editor.open ? editor.draft.id : undefined;
  const newEditorOpen = editor.open && editor.draft.id === null;
  const hasSections = doc.sections.length > 0;
  const anyCollapsed = doc.sections.some((section) => collapsedSections[section.id] ?? false);
  const runDisabledReason = editor.open ? "Save or cancel your edit first" : hasSections ? null : "Add a section to run it";

  const items = useMemo<RundownItem[]>(
    () =>
      doc.sections.map((section) => {
        const { code, beat } = splitSectionLabel(section);
        return {
          id: section.id,
          code,
          beat,
          status: sectionStatus(section),
          editing: editingId === section.id,
          reformatting: reformatState.scope === "section" && reformatState.targetId === section.id,
          updatedSinceVisit: sectionUpdatedSinceVisit(section),
          age: formatAge(sectionUpdatedAt(section), now)
        };
      }),
    [doc.sections, editingId, now, reformatState.scope, reformatState.targetId, sectionUpdatedSinceVisit]
  );

  function jumpTo(sectionId: string) {
    handlers.onExpandSection(sectionId);
    window.requestAnimationFrame(() => {
      const node = sectionRefs.current[sectionId];
      if (!node) {
        return;
      }
      scrollUnderBand(node, bandRef.current);
      node.querySelector<HTMLElement>("[data-section-toggle]")?.focus({ preventScroll: true });
    });
  }

  const onEditorOpened = useCallback((node: HTMLElement) => {
    scrollUnderBand(node.closest("article") ?? node, bandRef.current, true);
  }, []);

  function editorProps(): SectionEditorProps {
    return {
      draft: editor.draft,
      dirty: editor.dirty,
      working,
      onChange: handlers.onDraftChange,
      onSave: handlers.onSaveDraft,
      onCancel: handlers.onCancelDraft,
      onRequestDiscard: handlers.onRequestDiscardDraft,
      onOpened: onEditorOpened
    };
  }

  const reformatDisabled = working || !hasSections || editor.open;

  // Split layout: toolbar buttons (icons only when the script pane is narrow).
  const addSectionButton =
    canEdit && hasSections ? (
      layout.compactToolbar ? (
        <IconButton label="Add section" icon={Plus} variant="outline" onClick={handlers.onAddSection} disabled={working} />
      ) : (
        <Button type="button" variant="outline" onClick={handlers.onAddSection} disabled={working}>
          <Plus />
          Add section
        </Button>
      )
    ) : null;

  const reformatButton = canEdit ? (
    layout.compactToolbar ? (
      <IconButton label="Reformat all" icon={Sparkles} variant="outline" onClick={handlers.onReformatDoc} disabled={reformatDisabled} />
    ) : (
      <Button type="button" variant="outline" onClick={handlers.onReformatDoc} disabled={reformatDisabled}>
        <Sparkles />
        Reformat all
      </Button>
    )
  ) : null;

  // Narrow layout: Add section and Reformat all fold into the script card's ⋯ menu.
  const scriptMenu =
    canEdit && hasSections ? (
      <ActionMenu
        label="Script actions"
        className="-mr-2 max-md:h-10"
        items={[
          { key: "add", label: "Add section", icon: Plus, disabled: working, onSelect: handlers.onAddSection },
          { key: "reformat", label: "Reformat all", icon: Sparkles, disabled: reformatDisabled, onSelect: handlers.onReformatDoc }
        ]}
      />
    ) : null;

  const expandToggle = hasSections ? (
    narrow ? (
      <IconButton
        label={anyCollapsed ? "Expand all" : "Collapse all"}
        icon={anyCollapsed ? ChevronsUpDown : ChevronsDownUp}
        onClick={() => handlers.onSetAllCollapsed(!anyCollapsed)}
      />
    ) : (
      <ExpandAllToggle anyCollapsed={anyCollapsed} onSetAllCollapsed={handlers.onSetAllCollapsed} />
    )
  ) : null;

  const detail = (
    <div className="min-w-0">
      {narrow ? (
        <ScriptSwitcherCard
          doc={doc}
          statusContext={view.statusContext}
          progress={docProgress}
          onOpen={handlers.onOpenScripts}
          trailing={scriptMenu}
        />
      ) : null}

      <div ref={bandRef} className={cn("sticky z-10 border-b border-border bg-card", STICKY_TOP)}>
        {narrow ? (
          <RundownStrip
            touch
            items={items}
            onJump={jumpTo}
            trailing={
              <ActionBar size="touch" className="flex-nowrap">
                {expandToggle}
                <RunButton disabledReason={runDisabledReason} onRun={handlers.onRun} />
              </ActionBar>
            }
          />
        ) : (
          <>
            <div className={cn("flex items-center gap-3 px-4", PANE_HEADER_HEIGHT)}>
              {view.railCollapsed ? (
                <IconButton label="Show scripts" icon={PanelLeftOpen} className="-ml-2 pointer-coarse:h-10" onClick={handlers.onShowRail} />
              ) : null}
              <div className="min-w-0 flex-1">
                <h2 title={doc.title} className="truncate text-lg font-semibold leading-6 tracking-[-0.01em] text-foreground">
                  {doc.title}
                </h2>
                <DetailMeta doc={doc} now={now} statusContext={view.statusContext} docProgress={docProgress} />
              </div>
              <ActionBar className="shrink-0 flex-nowrap pointer-coarse:*:h-10">
                {addSectionButton}
                {reformatButton}
                <RunButton disabledReason={runDisabledReason} onRun={handlers.onRun} />
              </ActionBar>
            </div>
            {!layout.rundownColumn && hasSections ? (
              <div className="border-t border-border">
                <RundownStrip items={items} onJump={jumpTo} trailing={expandToggle} />
              </div>
            ) : null}
          </>
        )}
        {docProgress !== null ? <ProgressEdge value={docProgress} label="Reformatting script" /> : null}
      </div>

      <div>
        {!hasSections && !newEditorOpen ? (
          <EmptyState
            icon={ListPlus}
            title="No sections yet"
            description="Add A1 to start the rundown."
            action={
              canEdit ? (
                <Button type="button" onClick={handlers.onAddSection} disabled={working}>
                  <Plus />
                  Add section
                </Button>
              ) : null
            }
          />
        ) : null}
        {doc.sections.map((section) => (
          <SectionBlock
            key={section.id}
            ref={(node) => {
              sectionRefs.current[section.id] = node;
            }}
            section={section}
            collapsed={collapsedSections[section.id] ?? false}
            canEdit={canEdit}
            working={working}
            status={sectionStatus(section)}
            progress={reformatState.scope === "section" && reformatState.targetId === section.id ? reformatState.progress : null}
            age={formatAge(sectionUpdatedAt(section), now)}
            updatedSinceVisit={sectionUpdatedSinceVisit(section)}
            copied={view.copiedSectionId === section.id}
            editor={editingId === section.id ? editorProps() : null}
            onToggle={() => handlers.onToggleSection(section.id)}
            onCopy={() => handlers.onCopySection(section)}
            onEdit={() => handlers.onEditSection(section)}
            onReformat={() => handlers.onReformatSection(section)}
            onRefetch={() => handlers.onRefetchSection(section)}
            onDelete={() => handlers.onDeleteSection(section.id)}
          />
        ))}
        {newEditorOpen ? <NewSectionBlock {...editorProps()} /> : null}
      </div>
    </div>
  );

  if (!layout.rundownColumn) {
    return detail;
  }

  return (
    <>
      {detail}
      <RundownColumn items={items} onJump={jumpTo} anyCollapsed={anyCollapsed} onSetAllCollapsed={handlers.onSetAllCollapsed} />
    </>
  );
}
