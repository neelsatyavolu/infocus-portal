/**
 * Meeting agenda: shared DTO and pure helpers (server, Meetings tab editor, in-call panel).
 * Agenda text is ordinary Portal data like the meeting title; it is not end-to-end encrypted.
 */

export const AGENDA_TEXT_MAX = 300;
export const AGENDA_MAX_ITEMS = 100;

export type MeetingAgendaItemView = {
  id: string;
  text: string;
  position: number;
  done: boolean;
  doneAt: string | null;
  /** Display name of whoever checked it off. */
  doneByName: string | null;
};

/** GET/POST/PATCH/DELETE/PUT agenda responses all return the whole, ordered agenda. */
export type MeetingAgendaResponse = { items: MeetingAgendaItemView[]; readOnly: boolean };

/** Trimmed, single-spaced text, or null when empty or too long. */
export function cleanAgendaText(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > AGENDA_TEXT_MAX) return null;
  return text;
}

/** Positions 0..n-1 in the given order. */
export function renumber(ids: readonly string[]): Array<{ id: string; position: number }> {
  return ids.map((id, position) => ({ id, position }));
}

/** True when `proposed` is exactly the agenda's ids: same size, no duplicates, nothing missing or extra. */
export function isSameIdSet(current: readonly string[], proposed: readonly string[]) {
  if (current.length !== proposed.length) return false;
  const want = new Set(current);
  const seen = new Set<string>();
  for (const id of proposed) {
    if (!want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/** Moves the item at `from` to `to` (array indexes), returning a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Sorted by position, with positions rewritten to match (after an optimistic move). */
export function withPositions(items: readonly MeetingAgendaItemView[]): MeetingAgendaItemView[] {
  return items.map((item, position) => (item.position === position ? item : { ...item, position }));
}

export function sortAgenda(items: readonly MeetingAgendaItemView[]): MeetingAgendaItemView[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Optimistic check-off: flips one item's done state (the server fills in who and when). */
export function toggleDone(items: readonly MeetingAgendaItemView[], id: string, done: boolean, byName: string | null) {
  return items.map((item) =>
    item.id === id
      ? { ...item, done, doneAt: done ? new Date().toISOString() : null, doneByName: done ? byName : null }
      : item
  );
}

export function agendaProgress(items: readonly MeetingAgendaItemView[]) {
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, remaining: items.length - done };
}
