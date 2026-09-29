import { useEffect, useRef, useState, type DragEvent } from "react";
import { hasDraggedFiles, splitDroppedFiles, type DroppedFiles } from "@/src/lib/file-drop";

/**
 * Drag-and-drop file target. Spread `bind` on the drop zone; `dragging` is true while files hover it.
 * While mounted, a file dropped outside the zone (or while disabled, e.g. mid-upload) is ignored
 * instead of opening in the tab and leaving the page.
 */
export function useFileDrop({
  accept,
  disabled = false,
  onDrop
}: {
  accept: string;
  disabled?: boolean;
  onDrop: (files: DroppedFiles) => void;
}) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for child elements, so count depth instead of trusting one leave.
  const depth = useRef(0);

  useEffect(() => {
    function ignoreStrayDrop(event: globalThis.DragEvent) {
      if (event.defaultPrevented || !event.dataTransfer || !hasDraggedFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    }
    window.addEventListener("dragover", ignoreStrayDrop);
    window.addEventListener("drop", ignoreStrayDrop);
    return () => {
      window.removeEventListener("dragover", ignoreStrayDrop);
      window.removeEventListener("drop", ignoreStrayDrop);
    };
  }, []);

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return !disabled && hasDraggedFiles(event.dataTransfer.types);
  }

  const bind = {
    onDragEnter(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      onDrop(splitDroppedFiles(Array.from(event.dataTransfer.files), accept));
    }
  };

  return { dragging: dragging && !disabled, bind };
}
