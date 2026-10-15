"use client";

import { useState, type FormEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ListChecks, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { InlineError } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";
import { AGENDA_MAX_ITEMS, AGENDA_TEXT_MAX, cleanAgendaText, type MeetingAgendaItemView } from "@/src/lib/meetings/agenda";
import { AgendaRow } from "./agenda-row";
import type { useAgenda } from "./use-agenda";

type Agenda = ReturnType<typeof useAgenda>;

/** Read to screen readers on every drag handle (replaces dnd-kit's generic instructions). */
const REORDER_INSTRUCTIONS =
  "Drag the handle to reorder. With a keyboard: focus a handle, press Space, use the arrow keys, then Space. Escape cancels.";

function announcements(items: readonly MeetingAgendaItemView[]): Announcements {
  const label = (id: string | number) => items.find((i) => i.id === id)?.text ?? "item";
  const place = (id: string | number | undefined) => (id === undefined ? 0 : items.findIndex((i) => i.id === id) + 1);
  return {
    onDragStart: ({ active }) => `Picked up ${label(active.id)}, position ${place(active.id)} of ${items.length}.`,
    onDragOver: ({ active, over }) => (over ? `${label(active.id)} moved to position ${place(over.id)}.` : `${label(active.id)} is not over a position.`),
    onDragEnd: ({ active, over }) => (over ? `${label(active.id)} dropped at position ${place(over.id)}.` : `${label(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled.`
  };
}

/** The sortable agenda list (pointer, touch, keyboard) with inline edit and delete + undo. */
export function AgendaList({ agenda }: { agenda: Agenda }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const items = agenda.items ?? [];

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) void agenda.move(from, to);
  };

  const remove = (item: MeetingAgendaItemView) => {
    void agenda.remove(item.id).then((ok) => {
      if (!ok) return;
      toast("Item deleted", {
        description: item.text,
        // Undo re-adds it at the end; the person can drag it back into place.
        action: { label: "Undo", onClick: () => void agenda.add(item.text) }
      });
    });
  };

  if (agenda.loadError) return <InlineError>{agenda.loadError}</InlineError>;
  if (!agenda.items) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading agenda…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState size="panel" icon={ListChecks} title={agenda.readOnly ? "No agenda was set." : "No agenda yet. Add the first item."} />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements: announcements(items), screenReaderInstructions: { draggable: REORDER_INSTRUCTIONS } }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="grid gap-1.5" aria-label="Agenda">
          {items.map((item, index) => (
            <AgendaRow
              key={item.id}
              item={item}
              index={index}
              readOnly={agenda.readOnly}
              onRename={(text) => void agenda.rename(item.id, text)}
              onDelete={() => remove(item)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

/**
 * The agenda's footer: the add form (hidden at the item limit). Null until the agenda loads and
 * for meetings that are over (the sheet's description says the agenda is read-only). The
 * reorder hint sits under it (AgendaReorderHint).
 */
export function AgendaComposer({ agenda }: { agenda: Agenda }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  if (!agendaCanAdd(agenda)) return null;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const text = cleanAgendaText(draft);
    if (!text) return;
    setAdding(true);
    if (await agenda.add(text)) setDraft("");
    setAdding(false);
  };

  return (
    <form onSubmit={add} className="flex gap-2">
      <label htmlFor="agenda-add" className="sr-only">
        Add item
      </label>
      <input
        id="agenda-add"
        value={draft}
        maxLength={AGENDA_TEXT_MAX}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add item"
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] md:h-9 md:text-sm"
      />
      <Button type="submit" className="h-11 md:h-9" disabled={adding || !cleanAgendaText(draft)}>
        {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        Add
      </Button>
    </form>
  );
}

/** Whether the footer has the add form (loaded, not over, under the item limit). */
export function agendaCanAdd(agenda: Agenda) {
  return Boolean(agenda.items && !agenda.loadError && !agenda.readOnly && agenda.items.length < AGENDA_MAX_ITEMS);
}

/** Whether the footer shows how to reorder (loaded, not over, more than one item; also at the limit). */
export function agendaShowsReorderHint(agenda: Agenda) {
  return Boolean(agenda.items && !agenda.loadError && !agenda.readOnly && agenda.items.length > 1);
}

/** On-screen reorder help, so sighted keyboard users see how to move items too. */
export function AgendaReorderHint({ agenda }: { agenda: Agenda }) {
  if (!agendaShowsReorderHint(agenda)) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Drag the handle to reorder. With a keyboard: focus a handle, press Space, use the arrow keys, then Space.
    </p>
  );
}
