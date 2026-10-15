"use client";

import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { QUEUE_SHOW_FULL_MESSAGE, UNASSIGNED_SHOW_KEY, canManuallyPlaceOnShow } from "@/src/lib/publishing-queue";
import type { OccupiedOn, QueueRow } from "./queue-types";

export type RowDragProps = {
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

export type ShowDropProps = {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

/**
 * Producers drag a package onto a show (mouse only; phones use Move to another show). A show
 * accepts while it has room (max 2), and always accepts the package already on it.
 */
export function useQueueDrag({
  rows,
  occupiedOn,
  onMove
}: {
  rows: QueueRow[];
  occupiedOn: OccupiedOn;
  onMove: (rowId: string, showDate: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);

  function canDropOn(date: string) {
    if (date === UNASSIGNED_SHOW_KEY) return false;
    const dragged = draggingId ? rows.find((row) => row.id === draggingId) : null;
    if (dragged?.queuedForShowDate === date) return true;
    return canManuallyPlaceOnShow(occupiedOn(date, draggingId));
  }

  function rowDragProps(row: QueueRow, busy: boolean): RowDragProps {
    return {
      draggable: !busy,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.id);
        setDraggingId(row.id);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverDate(null);
      }
    };
  }

  function showDropProps(date: string): ShowDropProps {
    return {
      onDragOver: (event) => {
        if (!canDropOn(date)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOverDate(date);
      },
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOverDate((current) => (current === date ? null : current));
      },
      onDrop: (event) => {
        event.preventDefault();
        setOverDate(null);
        const rowId = event.dataTransfer.getData("text/plain");
        setDraggingId(null);
        if (!rowId || date === UNASSIGNED_SHOW_KEY) return;
        const row = rows.find((item) => item.id === rowId);
        if (!row || row.queuedForShowDate === date) return;
        if (!canManuallyPlaceOnShow(occupiedOn(date, rowId))) {
          toast.error(QUEUE_SHOW_FULL_MESSAGE);
          return;
        }
        onMove(rowId, date);
      }
    };
  }

  return { draggingId, overDate, canDropOn, rowDragProps, showDropProps };
}
