"use client";

import { forwardRef, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu } from "@/components/kit/menu";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitShortcutHint, isSubmitShortcut } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/src/lib/utils";
import { splitPlaceholders, splitSectionLabel, type SectionDraft, type SectionStatus, type TeleprompterSection } from "./teleprompter-model";
import { ProgressEdge, ReformattingTag } from "./teleprompter-parts";

/**
 * Body text starts at the section code's x (16px gutter + 16px chevron + 8px gap) from sm; on
 * phones it uses the plain 16px gutter so the script gets the width.
 */
const BODY_INSET = "pl-4 pr-4 sm:pl-10";
/** One measure for reading and editing, so text doesn't rewrap when Edit opens. */
const TEXT_MEASURE = "max-w-[70ch]";
const ROW_ACTION_CLASS = "pointer-coarse:h-10";

/** Script text with [INSERT …] placeholders marked, so what still needs filling stands out. */
function ScriptText({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(text).map((part, index) =>
        part.placeholder ? (
          <mark
            key={index}
            className="rounded-sm bg-[var(--brand-amber)]/15 px-0.5 text-inherit [box-decoration-break:clone] outline outline-1 -outline-offset-1 outline-[var(--brand-amber)]/40"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  );
}

function SectionStatusTag({ status }: { status: SectionStatus }) {
  if (status === "to-fill") {
    return (
      <StatusTag tone="warning" size="sm">
        To fill
      </StatusTag>
    );
  }
  if (status === "empty") {
    return (
      <StatusTag tone="neutral" size="sm">
        Empty
      </StatusTag>
    );
  }
  return null;
}

/** Code (Geist Mono, one shared column width) and the beat name. */
function SectionTitle({ code, beat }: { code: string; beat: string | null }) {
  return (
    <>
      <span
        title={code}
        className="w-[var(--tp-code-w,2ch)] shrink-0 truncate font-mono-broadcast text-xs font-medium tabular-nums text-[var(--ink-text)]"
      >
        {code}
      </span>
      {beat ? <span className="min-w-0 truncate text-sm font-semibold text-foreground">{beat}</span> : null}
    </>
  );
}

export type SectionEditorProps = {
  draft: SectionDraft;
  dirty: boolean;
  working: boolean;
  onChange: (draft: SectionDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Esc with unsaved changes: ask before throwing them away. */
  onRequestDiscard: () => void;
  /** Called once the editor is on screen, to bring it into view. */
  onOpened?: (node: HTMLElement) => void;
};

/** The inline section editor: same fields, copy, guards and payloads as the old dialog. */
function SectionEditor({ draft, dirty, working, onChange, onSave, onCancel, onRequestDiscard, onOpened }: SectionEditorProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Only read by the mount effect, so the first render's callback is the one it needs.
  const onOpenedRef = useRef(onOpened);
  const heading = splitSectionLabel({ label: draft.label, content: draft.content }).beat
    ? draft.content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? null
    : null;

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });
    if (rootRef.current) {
      onOpenedRef.current?.(rootRef.current);
    }
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isSubmitShortcut(event)) {
      event.preventDefault();
      if (!working && draft.label.trim()) {
        onSave();
      }
      return;
    }
    if (event.key === "Escape" && !working) {
      event.preventDefault();
      if (dirty) {
        onRequestDiscard();
      } else {
        onCancel();
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("space-y-3 pb-4", BODY_INSET)} onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor={`${id}-label`} className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
          Label
        </label>
        <Input
          id={`${id}-label`}
          value={draft.label}
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
          placeholder="A1"
          className="h-9 w-28 font-mono-broadcast max-md:h-10"
        />
        <span className="text-xs text-muted-foreground">Labels like A1, A2, B1.</span>
      </div>
      <div>
        <label htmlFor={`${id}-script`} className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
          Script
        </label>
        <Textarea
          ref={textareaRef}
          id={`${id}-script`}
          value={draft.content}
          onChange={(event) => onChange({ ...draft, content: event.target.value })}
          rows={14}
          placeholder="ANCHOR: Good morning everyone..."
          aria-describedby={heading ? `${id}-heading` : undefined}
          className={cn(TEXT_MEASURE, "resize-y font-sans text-base leading-[1.6] md:text-[15px]")}
        />
        {heading ? (
          <p id={`${id}-heading`} className="mt-1.5 text-xs text-muted-foreground">
            The first line, “{heading}”, names the beat in the header. It isn&apos;t shown on the prompter.
          </p>
        ) : null}
      </div>
      {/* The textarea's measure and font size, so Save ends where the textarea ends. */}
      <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-base md:text-[15px]", TEXT_MEASURE)}>
        <p className="min-w-0 text-xs text-muted-foreground">Optional run-mode color: [RED]text[/RED] and [YELLOW]text[/YELLOW].</p>
        <div className="ml-auto flex items-center gap-2">
          <SubmitShortcutHint action="save" className="hidden lg:inline" />
          <Button type="button" variant="ghost" onClick={onCancel} disabled={working} className="max-md:h-10">
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={working || !draft.label.trim()} className="max-md:h-10">
            {working ? "Saving..." : draft.id ? "Save" : "Add section"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A new section being written, appended after the last one. */
export function NewSectionBlock(props: SectionEditorProps) {
  return (
    <article aria-label="New section" className="border-t border-border first:border-t-0">
      <div className={"flex h-12 items-center gap-2 pl-4 pr-3"}>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <SectionTitle code={props.draft.label.trim() || "—"} beat="New section" />
        <StatusTag tone="info" size="sm">
          Editing
        </StatusTag>
      </div>
      <SectionEditor {...props} />
    </article>
  );
}

export type SectionBlockProps = {
  section: TeleprompterSection;
  collapsed: boolean;
  canEdit: boolean;
  working: boolean;
  status: SectionStatus;
  /** 0–100 while this section is being reformatted or refetched, else null. */
  progress: number | null;
  age: string;
  updatedSinceVisit: boolean;
  copied: boolean;
  /** Set while this section is open in the inline editor. */
  editor: SectionEditorProps | null;
  onToggle: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onReformat: () => void;
  onRefetch: () => void;
  onDelete: () => void;
};

/** One rundown section: header (toggle, status, age, actions) and the script text or the inline editor. */
export const SectionBlock = forwardRef<HTMLElement, SectionBlockProps>(function SectionBlock(
  {
    section,
    collapsed,
    canEdit,
    working,
    status,
    progress,
    age,
    updatedSinceVisit,
    copied,
    editor,
    onToggle,
    onCopy,
    onEdit,
    onReformat,
    onRefetch,
    onDelete
  },
  ref
) {
  const bodyId = useId();
  const { code, beat, content } = splitSectionLabel(section);
  const editing = editor !== null;
  const open = editing || !collapsed;
  const Chevron = open ? ChevronDown : ChevronRight;

  let statusSlot: ReactNode = null;
  if (editing) {
    statusSlot = (
      <StatusTag tone="info" size="sm">
        Editing
      </StatusTag>
    );
  } else if (progress !== null) {
    statusSlot = <ReformattingTag progress={progress} />;
  } else {
    statusSlot = <SectionStatusTag status={status} />;
  }

  return (
    <article ref={ref} aria-label={beat ? `${code} ${beat}` : code} className="border-t border-border first:border-t-0">
      <div className={"relative flex h-12 items-center gap-2 pl-4 pr-2 sm:pr-3"}>
        {editing ? (
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2">
            <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <SectionTitle code={code} beat={beat} />
            {statusSlot}
          </div>
        ) : (
          <h3 className="flex min-w-0 flex-1">
            <button
              type="button"
              data-section-toggle
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={bodyId}
              className="-ml-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md pl-1 pr-2 pointer-coarse:h-10 text-left transition-colors hover:bg-[var(--ink-3)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <SectionTitle code={code} beat={beat} />
              {statusSlot}
            </button>
          </h3>
        )}

        {!editing && (age || updatedSinceVisit) ? (
          <span
            className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
            title={updatedSinceVisit ? "Updated since your last visit" : undefined}
          >
            {updatedSinceVisit ? (
              <>
                <StatusDot tone="new" size={6} />
                <span className="sr-only">Updated since your last visit.</span>
              </>
            ) : null}
            {age ? (
              <span className={cn("hidden sm:inline", updatedSinceVisit && "text-[var(--brand-green)]")}>
                Updated <span className="font-mono-broadcast tabular-nums">{age}</span>
              </span>
            ) : null}
          </span>
        ) : null}

        {canEdit && !editing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label={copied ? "Copied" : "Copy section"}
              icon={copied ? Check : Copy}
              size="sm"
              className={ROW_ACTION_CLASS}
              onClick={onCopy}
            />
            <IconButton label="Edit section" icon={Pencil} size="sm" className={ROW_ACTION_CLASS} onClick={onEdit} />
            <ActionMenu
              label={`More actions for ${code}`}
              size="sm"
              className={ROW_ACTION_CLASS}
              items={[
                { key: "reformat", label: "Reformat section", icon: Sparkles, disabled: working, onSelect: onReformat },
                {
                  key: "refetch",
                  label: "Refetch bulletin",
                  icon: RefreshCw,
                  disabled: working,
                  hidden: section.label !== "A2",
                  onSelect: onRefetch
                },
                "separator",
                { key: "delete", label: "Delete section", icon: Trash2, tone: "danger", onSelect: onDelete }
              ]}
            />
          </div>
        ) : null}

        {progress !== null ? <ProgressEdge value={progress} label={`Reformatting ${code}`} /> : null}
      </div>

      <div id={bodyId} hidden={!open}>
        {editor ? (
          <SectionEditor {...editor} />
        ) : (
          <div className={cn("pb-4", BODY_INSET)}>
            {content ? (
              <p className={cn(TEXT_MEASURE, "whitespace-pre-wrap text-pretty text-[15px] leading-[1.6] text-foreground [overflow-wrap:anywhere]")}>
                <ScriptText text={content} />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Empty section.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
});
