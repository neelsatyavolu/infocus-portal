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
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AGENDA_MAX_ITEMS, AGENDA_TEXT_MAX, cleanAgendaText, type MeetingAgendaItemView } from "@/src/lib/meetings/agenda";
import { AgendaRow } from "./agenda-row";
import type { useAgenda } from "./use-agenda";

type Agenda = ReturnType<typeof useAgenda>;

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

/** Sortable agenda list (pointer, touch, keyboard) with inline edit, delete + undo, and add. */
export function AgendaEditor({ agenda }: { agenda: Agenda }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
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

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const text = cleanAgendaText(draft);
    if (!text) return;
    setAdding(true);
    if (await agenda.add(text)) setDraft("");
    setAdding(false);
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

  if (agenda.loadError) return <p className="text-sm text-danger">{agenda.loadError}</p>;
  if (!agenda.items) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading agenda…
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {items.length === 0 ? (
        <p className="rounded-md bg-[var(--ink-3)] px-3 py-4 text-center text-sm text-muted-foreground">No agenda yet. Add the first item.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements: announcements(items) }}>
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
      )}
      {agenda.readOnly ? (
        <p className="text-xs text-muted-foreground">This meeting is over, so its agenda is read-only.</p>
      ) : items.length < AGENDA_MAX_ITEMS ? (
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
      ) : null}
      {!agenda.readOnly && items.length > 1 ? (
        <p className="text-xs text-muted-foreground">Drag the handle to reorder. With a keyboard: focus a handle, press Space, use the arrow keys, then Space.</p>
      ) : null}
    </div>
  );
}
