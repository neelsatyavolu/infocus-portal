"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { getActiveVersion } from "@/components/project-assets/format";
import type { DragPreviewState, MediaTileItem } from "@/components/project-assets/types";

/**
 * Drag an asset (or the whole selection) onto a folder tile or row. The browser's drag image is
 * replaced by a transparent ghost; DragPreview follows the pointer through `dragOverlayRef`.
 * Moved verbatim from project-media-tiles.tsx.
 */
export function useAssetDrag({
  items,
  selectedIds,
  selectedVersionByMedia,
  moveOne,
  moveSelected
}: {
  items: MediaTileItem[];
  selectedIds: string[];
  selectedVersionByMedia: Record<string, string>;
  moveOne: (mediaId: string, folderValue: string) => void;
  moveSelected: (folderValue: string) => void;
}) {
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const transparentDragImageRef = useRef<HTMLDivElement | null>(null);
  const dragOverlayFrameRef = useRef<number | null>(null);
  const dragPointerRef = useRef({ x: 0, y: 0 });
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const updateDragOverlayPosition = useCallback((clientX: number, clientY: number) => {
    dragPointerRef.current = { x: clientX, y: clientY };

    if (dragOverlayFrameRef.current !== null) {
      return;
    }

    dragOverlayFrameRef.current = window.requestAnimationFrame(() => {
      dragOverlayFrameRef.current = null;
      const overlay = dragOverlayRef.current;
      if (!overlay) {
        return;
      }

      const { x, y } = dragPointerRef.current;
      overlay.style.transform = `translate3d(${x + 18}px, ${y + 18}px, 0)`;
    });
  }, []);

  useEffect(() => {
    if (!draggingMediaId) {
      return;
    }

    function handleWindowDragOver(event: DragEvent) {
      updateDragOverlayPosition(event.clientX, event.clientY);
    }

    function handleWindowDrop() {
      setDragOverFolderId(null);
    }

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [draggingMediaId, updateDragOverlayPosition]);

  useEffect(() => {
    return () => {
      if (dragOverlayFrameRef.current !== null) {
        window.cancelAnimationFrame(dragOverlayFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const ghost = document.createElement("div");
    ghost.style.position = "fixed";
    ghost.style.left = "-9999px";
    ghost.style.top = "-9999px";
    ghost.style.width = "1px";
    ghost.style.height = "1px";
    ghost.style.opacity = "0";
    ghost.style.pointerEvents = "none";
    document.body.appendChild(ghost);
    transparentDragImageRef.current = ghost;

    return () => {
      transparentDragImageRef.current = null;
      ghost.remove();
    };
  }, []);

  function onMediaDragStart(event: ReactDragEvent<HTMLElement>, mediaId: string) {
    const draggedItem = items.find((item) => item.id === mediaId) ?? null;
    const moveCount = selectedIds.includes(mediaId) && selectedIds.length > 1 ? selectedIds.length : 1;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", mediaId);
    if (transparentDragImageRef.current) {
      event.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
    }

    updateDragOverlayPosition(event.clientX, event.clientY);
    setDraggingMediaId(mediaId);
    setDragOverFolderId(null);
    setDragPreview(
      draggedItem
        ? {
            title: draggedItem.title,
            thumbnailUrl: getActiveVersion(draggedItem, selectedVersionByMedia)?.thumbnailUrl ?? null,
            itemCount: moveCount
          }
        : {
            title: "Moving asset",
            thumbnailUrl: null,
            itemCount: moveCount
          }
    );
  }

  function onMediaDragEnd() {
    if (dragOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(dragOverlayFrameRef.current);
      dragOverlayFrameRef.current = null;
    }
    setDraggingMediaId(null);
    setDragPreview(null);
    setDragOverFolderId(null);
  }

  function onFolderDrop(folderId: string) {
    if (!draggingMediaId) {
      return;
    }

    if (selectedIds.includes(draggingMediaId) && selectedIds.length > 1) {
      moveSelected(folderId);
    } else {
      moveOne(draggingMediaId, folderId);
    }
    setDragOverFolderId(null);
    setDraggingMediaId(null);
    setDragPreview(null);
  }

  function setDragTarget(folderId: string) {
    setDragOverFolderId((current) => (current === folderId ? current : folderId));
  }

  return {
    dragOverlayRef,
    draggingMediaId,
    dragPreview,
    dragOverFolderId,
    onMediaDragStart,
    onMediaDragEnd,
    onFolderDrop,
    setDragTarget
  };
}
