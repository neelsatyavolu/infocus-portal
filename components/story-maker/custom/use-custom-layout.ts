"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  apDate,
  type StoryPhoto
} from "@/src/lib/story-maker";
import {
  addElement,
  clampToCanvas,
  createElement,
  duplicateElement,
  historyReducer,
  initialHistory,
  moveLayer,
  parseLayout,
  rectOf,
  removeElement,
  serializeLayout,
  starterLayout,
  updateElement,
  type CustomBackground,
  type CustomElement,
  type CustomLayout,
  type ElementPreset,
  type MeasuredHeights
} from "@/src/lib/story-custom";
import { readStoryPhoto } from "../story-photos";

const STORE_KEY = "infocus-story-maker:custom:v2";
const NUDGE = 4;
const NUDGE_BIG = 24;

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12);

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export const PHOTO_ERROR = "Couldn’t open that photo. Use a JPG or PNG (export iPhone HEIC photos as JPG first).";

/**
 * State for the Custom template: the layout with undo/redo, the selected piece, and measured
 * heights. The layout (without photos) is remembered in this browser. Keyboard shortcuts are
 * active only while `active` is true and focus isn't in a text field.
 */
export function useCustomLayout(active: boolean) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initialHistory(starterLayout((n) => `starter-${n}`, apDate(new Date()))));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<MeasuredHeights>({});
  const loaded = useRef(false);
  const layout = history.present;
  const selected = layout.elements.find((el) => el.id === selectedId) ?? null;

  useEffect(() => {
    try {
      const saved = parseLayout(window.localStorage.getItem(STORE_KEY) ?? "");
      if (saved) dispatch({ type: "load", layout: saved });
    } catch {
      // Storage blocked: start from the starter layout.
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORE_KEY, serializeLayout(layout));
    } catch {
      // Private windows can block storage; the layout just won't be remembered.
    }
  }, [layout]);

  const commit = useCallback((next: CustomLayout, key?: string) => dispatch({ type: "commit", layout: next, key }), []);

  const add = useCallback(
    (preset: ElementPreset, patch: Partial<CustomElement> = {}) => {
      const el = { ...createElement(preset, newId(), layout.background), ...patch } as CustomElement;
      commit(addElement(layout, el));
      setSelectedId(el.id);
      return el.id;
    },
    [commit, layout]
  );

  const update = useCallback((id: string, patch: Partial<CustomElement>, key?: string) => commit(updateElement(layout, id, patch), key), [commit, layout]);
  const remove = useCallback((id: string) => {
    commit(removeElement(layout, id));
    setSelectedId(null);
  }, [commit, layout]);
  const duplicate = useCallback((id: string) => {
    const copyId = newId();
    commit(duplicateElement(layout, id, copyId));
    setSelectedId(copyId);
  }, [commit, layout]);
  const layer = useCallback((id: string, to: "front" | "back" | "forward" | "backward") => commit(moveLayer(layout, id, to)), [commit, layout]);
  const setBackground = useCallback((background: CustomBackground) => commit({ ...layout, background }), [commit, layout]);
  const startOver = useCallback(() => {
    commit(starterLayout(() => newId(), apDate(new Date())));
    setSelectedId(null);
    toast.success("Started over. Undo brings your layout back.");
  }, [commit]);

  const readPhoto = useCallback(async (file: File): Promise<StoryPhoto | null> => {
    try {
      return await readStoryPhoto(file);
    } catch {
      toast.error(PHOTO_ERROR);
      return null;
    }
  }, []);

  /** A dropped photo fills the selected photo box, else an empty photo background, else becomes a new photo box. */
  const dropPhoto = useCallback(async (file: File) => {
    const photo = await readPhoto(file);
    if (!photo) return;
    if (selected?.kind === "photo") update(selected.id, { photo });
    else if (layout.background.kind === "photo" && !layout.background.photo) setBackground({ kind: "photo", photo });
    else add("photo", { photo });
  }, [add, layout.background, readPhoto, selected, setBackground, update]);

  const fillStory = useCallback((id: string) => update(id, { x: 0, y: 0, w: STORY_WIDTH, h: STORY_HEIGHT }), [update]);
  const centre = useCallback((id: string) => {
    const el = layout.elements.find((item) => item.id === id);
    if (!el) return;
    const r = rectOf(el, measured);
    update(id, { x: Math.round((STORY_WIDTH - r.w) / 2) });
  }, [layout.elements, measured, update]);

  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (isEditable(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (!selected) return;
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicate(selected.id);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove(selected.id);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_BIG : NUDGE;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const r = rectOf(selected, measured);
        update(selected.id, clampToCanvas({ ...r, x: r.x + dx, y: r.y + dy }), `nudge:${selected.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, duplicate, measured, remove, selected, update]);

  return {
    layout,
    selected,
    measured,
    setMeasured,
    select: setSelectedId,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    checkpoint: () => dispatch({ type: "checkpoint" }),
    transient: (next: CustomLayout) => dispatch({ type: "transient", layout: next }),
    add,
    update,
    remove,
    duplicate,
    layer,
    setBackground,
    startOver,
    readPhoto,
    dropPhoto,
    fillStory,
    centre
  };
}

export type CustomLayoutApi = ReturnType<typeof useCustomLayout>;
