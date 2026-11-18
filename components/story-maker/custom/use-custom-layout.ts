"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { CANVAS, apDate, type StoryFormat, type StoryPhoto } from "@/src/lib/story-maker";
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

/** One layout per format (coordinates are canvas pixels). v2 layouts were stories, so they load as the story. */
const storeKey = (format: StoryFormat) => `infocus-story-maker:custom:v3:${format}`;
const LEGACY_STORY_KEY = "infocus-story-maker:custom:v2";
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
 * active only while `active` is true and focus isn't in a text field. `format` sets the canvas
 * that new pieces, snapping and the starter layout use.
 */
export function useCustomLayout(active: boolean, format: StoryFormat = "post") {
  const spec = CANVAS[format];
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initialHistory(starterLayout((n) => `starter-${n}`, apDate(new Date()), CANVAS[format])));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<MeasuredHeights>({});
  /** The format whose saved layout is on screen; nothing is saved until it is loaded. */
  const loaded = useRef<StoryFormat | null>(null);
  const layout = history.present;
  const selected = layout.elements.find((el) => el.id === selectedId) ?? null;

  // Load this format's layout (on open and whenever the format changes); otherwise its starter.
  useEffect(() => {
    let saved: CustomLayout | null = null;
    try {
      const stored = window.localStorage.getItem(storeKey(format)) ?? (format === "story" ? window.localStorage.getItem(LEGACY_STORY_KEY) : null);
      saved = parseLayout(stored ?? "");
    } catch {
      // Storage blocked: start from the starter layout.
    }
    // A selection from the other format's layout matches no piece here, so nothing stays selected.
    dispatch({ type: "load", layout: saved ?? starterLayout(() => newId(), apDate(new Date()), CANVAS[format]) });
    loaded.current = format;
  }, [format]);

  useEffect(() => {
    if (loaded.current !== format) return;
    try {
      window.localStorage.setItem(storeKey(format), serializeLayout(layout));
    } catch {
      // Private windows can block storage; the layout just won't be remembered.
    }
  }, [layout, format]);

  const commit = useCallback((next: CustomLayout, key?: string) => dispatch({ type: "commit", layout: next, key }), []);

  const add = useCallback(
    (preset: ElementPreset, patch: Partial<CustomElement> = {}) => {
      const el = { ...createElement(preset, newId(), layout.background, spec), ...patch } as CustomElement;
      commit(addElement(layout, el));
      setSelectedId(el.id);
      return el.id;
    },
    [commit, layout, spec]
  );

  const update = useCallback((id: string, patch: Partial<CustomElement>, key?: string) => commit(updateElement(layout, id, patch), key), [commit, layout]);
  const remove = useCallback((id: string) => {
    commit(removeElement(layout, id));
    setSelectedId(null);
  }, [commit, layout]);
  const duplicate = useCallback((id: string) => {
    const copyId = newId();
    commit(duplicateElement(layout, id, copyId, spec));
    setSelectedId(copyId);
  }, [commit, layout, spec]);
  const layer = useCallback((id: string, to: "front" | "back" | "forward" | "backward") => commit(moveLayer(layout, id, to)), [commit, layout]);
  const setBackground = useCallback((background: CustomBackground) => commit({ ...layout, background }), [commit, layout]);
  const startOver = useCallback(() => {
    commit(starterLayout(() => newId(), apDate(new Date()), spec));
    setSelectedId(null);
    toast.success("Started over. Undo brings your layout back.");
  }, [commit, spec]);

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

  const fillStory = useCallback((id: string) => update(id, { x: 0, y: 0, w: spec.width, h: spec.height }), [update, spec]);
  const centre = useCallback((id: string) => {
    const el = layout.elements.find((item) => item.id === id);
    if (!el) return;
    const r = rectOf(el, measured);
    update(id, { x: Math.round((spec.width - r.w) / 2) });
  }, [layout.elements, measured, update, spec]);

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
        update(selected.id, clampToCanvas({ ...r, x: r.x + dx, y: r.y + dy }, spec), `nudge:${selected.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, duplicate, measured, remove, selected, update, spec]);

  return {
    spec,
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
