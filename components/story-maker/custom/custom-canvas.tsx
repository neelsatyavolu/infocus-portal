"use client";

import { useContext, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  clampToCanvas,
  rectOf,
  resizeElement,
  snapMove,
  snapTargets,
  updateElement,
  type CustomElement,
  type SnapTargets
} from "@/src/lib/story-custom";
import { Photo } from "../story-templates";
import { StoryScaleContext } from "../story-canvas";
import { CustomElementArt, elementBox } from "./custom-elements";
import type { CustomLayoutApi } from "./use-custom-layout";

type Drag = {
  mode: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  origin: CustomElement;
  targets: SnapTargets;
};
type Guides = { x: number[]; y: number[] };
const NO_GUIDES: Guides = { x: [], y: [] };
const RESIZE_WIDTH_ONLY = new Set(["text", "footer", "follow"]);

export const TEXT_INPUT_ID = "custom-text-input";

/**
 * The freeform canvas. Drag a piece to move it (snaps to margins, centre, safe lines and other
 * pieces; hold Alt/Option to place freely); drag the green handle to resize; double-click text to
 * edit it in the panel. Selection outlines and guides are editor chrome and never exported.
 */
export function CustomCanvas({ api }: { api: CustomLayoutApi }) {
  const { layout, selected, measured, setMeasured } = api;
  const scale = useContext(StoryScaleContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

  // Measure auto-height pieces after each render so snapping and brand checks use real sizes.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>("[data-el-id]").forEach((node) => {
      next[node.dataset.elId as string] = node.offsetHeight;
    });
    const changed = Object.keys(next).length !== Object.keys(measured).length || Object.entries(next).some(([id, h]) => measured[id] !== h);
    if (changed) setMeasured(next);
  });

  function begin(event: PointerEvent<HTMLElement>, el: CustomElement, mode: Drag["mode"]) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    api.select(el.id);
    api.checkpoint();
    drag.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: el, targets: snapTargets(layout, el.id, measured) };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = (event.clientX - d.startX) / scale;
    const dy = (event.clientY - d.startY) / scale;
    const origin = rectOf(d.origin, measured);
    if (d.mode === "move") {
      const moved = { ...origin, x: origin.x + dx, y: origin.y + dy };
      const snapped = event.altKey ? { x: Math.round(moved.x), y: Math.round(moved.y), guides: NO_GUIDES } : snapMove(moved, d.targets);
      setGuides(snapped.guides);
      api.transient(updateElement(layout, d.origin.id, clampToCanvas({ ...origin, x: snapped.x, y: snapped.y })));
    } else {
      const size = resizeElement(d.origin, origin.w + dx, origin.h + dy, event.altKey ? { xs: [], ys: [] } : d.targets);
      setGuides(size.guides);
      api.transient(updateElement(layout, d.origin.id, { w: size.w, h: size.h }));
    }
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setGuides(NO_GUIDES);
  }

  const handlers = (el: CustomElement, mode: Drag["mode"]) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => begin(event, el, mode),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end
  });

  return (
    <div
      ref={rootRef}
      className="sm-custom"
      style={{ "--sm-ui": `${1 / scale}px` } as CSSProperties}
      onPointerDown={() => api.select(null)}
    >
      {layout.background.kind === "photo" ? <Photo photo={layout.background.photo} className="sm-bleed" /> : null}

      {layout.elements.map((el) => (
        <div
          key={el.id}
          data-el-id={el.id}
          className={el.id === selected?.id ? "sm-el sm-selected" : "sm-el"}
          style={elementBox(el)}
          {...handlers(el, "move")}
          onDoubleClick={() => {
            if (el.kind === "text") document.getElementById(TEXT_INPUT_ID)?.focus();
          }}
        >
          <CustomElementArt el={el} />
          {el.id === selected?.id && el.kind !== "header" ? (
            <div
              className={RESIZE_WIDTH_ONLY.has(el.kind) ? "sm-edit-ui sm-handle sm-handle-x" : "sm-edit-ui sm-handle"}
              role="presentation"
              {...handlers(el, "resize")}
            />
          ) : null}
        </div>
      ))}

      {guides.x.map((x) => <div key={`gx-${x}`} className="sm-edit-ui sm-guide sm-guide-x" style={{ left: x }} />)}
      {guides.y.map((y) => <div key={`gy-${y}`} className="sm-edit-ui sm-guide sm-guide-y" style={{ top: y }} />)}
    </div>
  );
}
