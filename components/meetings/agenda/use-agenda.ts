"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  moveItem,
  sortAgenda,
  toggleDone,
  withPositions,
  type MeetingAgendaItemView,
  type MeetingAgendaResponse
} from "@/src/lib/meetings/agenda";
import { agendaApi } from "@/src/lib/meetings/client/agenda-api";
import { errorMessage } from "@/src/lib/meetings/client/api";

/**
 * One meeting's agenda with optimistic edits: change locally, send, then adopt the server's copy
 * (or roll back and toast on error). `refresh()` refetches (e.g. on the room's `agenda` event).
 */
export function useAgenda(meetingId: string, enabled = true) {
  const [items, setItems] = useState<MeetingAgendaItemView[] | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const itemsRef = useRef<MeetingAgendaItemView[] | null>(null);
  const pending = useRef(0);

  const adopt = useCallback((data: MeetingAgendaResponse) => {
    const next = sortAgenda(data.items);
    itemsRef.current = next;
    setItems(next);
    setReadOnly(data.readOnly);
  }, []);

  const setLocal = useCallback((next: MeetingAgendaItemView[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await agendaApi.get(meetingId);
      // Don't clobber an optimistic change that's still in flight; its response will land.
      if (pending.current === 0) adopt(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, "Couldn't load the agenda."));
    }
  }, [adopt, meetingId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  /** Applies `optimistic` now, then runs `send`; rolls back with a toast on failure. */
  const mutate = useCallback(
    async (optimistic: MeetingAgendaItemView[] | null, send: () => Promise<MeetingAgendaResponse>, failure: string) => {
      const before = itemsRef.current;
      if (optimistic) setLocal(optimistic);
      pending.current += 1;
      try {
        const data = await send();
        pending.current -= 1;
        if (pending.current === 0) adopt(data);
        return true;
      } catch (err) {
        pending.current -= 1;
        if (before) setLocal(before);
        toast.error(errorMessage(err, failure));
        return false;
      }
    },
    [adopt, setLocal]
  );

  const current = () => itemsRef.current ?? [];

  return {
    items,
    readOnly,
    loadError,
    refresh,
    add: (text: string) => mutate(null, () => agendaApi.add(meetingId, text), "Couldn't add that item."),
    setDone: (id: string, done: boolean, byName: string | null) =>
      mutate(toggleDone(current(), id, done, byName), () => agendaApi.update(meetingId, id, { done }), "Couldn't update that item."),
    rename: (id: string, text: string) =>
      mutate(
        current().map((item) => (item.id === id ? { ...item, text } : item)),
        () => agendaApi.update(meetingId, id, { text }),
        "Couldn't rename that item."
      ),
    remove: (id: string) =>
      mutate(withPositions(current().filter((item) => item.id !== id)), () => agendaApi.remove(meetingId, id), "Couldn't delete that item."),
    move: (from: number, to: number) => {
      const next = withPositions(moveItem(current(), from, to));
      return mutate(next, () => agendaApi.reorder(meetingId, next.map((item) => item.id)), "Couldn't save the new order.");
    }
  };
}
