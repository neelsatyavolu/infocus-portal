"use client";

import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Trash2 } from "lucide-react";
import { AGENDA_TEXT_MAX, cleanAgendaText, type MeetingAgendaItemView } from "@/src/lib/meetings/agenda";
import { cn } from "@/src/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";

/** One sortable agenda line in the editor: drag handle, click-to-edit text, delete. */
export function AgendaRow({
  item,
  index,
  readOnly,
  onRename,
  onDelete
}: {
  item: MeetingAgendaItemView;
  index: number;
  readOnly: boolean;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: readOnly
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    const text = cleanAgendaText(draft);
    setEditing(false);
    if (text && text !== item.text) onRename(text);
    else setDraft(item.text);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-h-11 items-center gap-1 rounded-md bg-[var(--ink-2)] pr-1 outline outline-1 outline-[var(--ink-4)]",
        isDragging && "relative z-10 outline-2 outline-[var(--brand-green)]"
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={readOnly}
        aria-label={`Move item ${index + 1}: ${item.text}`}
        className={cn(
          "flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-40",
          FOCUS
        )}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
      {editing ? (
        <form onSubmit={save} className="min-w-0 flex-1">
          <input
            autoFocus
            value={draft}
            maxLength={AGENDA_TEXT_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => save()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(item.text);
                setEditing(false);
              }
            }}
            aria-label="Agenda item"
            className={cn("h-9 w-full rounded-md border border-input bg-transparent px-2 text-base text-foreground md:text-sm", FOCUS)}
          />
        </form>
      ) : (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            setDraft(item.text);
            setEditing(true);
          }}
          className={cn(
            "min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm disabled:cursor-default",
            item.done ? "text-muted-foreground line-through" : "text-foreground",
            !readOnly && "hover:bg-[var(--ink-3)]",
            FOCUS
          )}
        >
          {item.text}
          {item.done ? (
            <span className="ml-2 inline-flex items-center gap-0.5 text-xs no-underline">
              <Check className="h-3 w-3" aria-hidden /> {item.doneByName ?? "Done"}
            </span>
          ) : null}
        </button>
      )}
      {!readOnly ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete "${item.text}"`}
          className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-tint hover:text-danger", FOCUS)}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
