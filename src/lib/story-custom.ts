/**
 * Custom (freeform) Instagram layouts: brand pieces placed anywhere on the 1080 × 1920 canvas.
 * The brand is kept by construction (Lexend presets, brand colors, square plates, no rotation or
 * shadows, text ≥ 24px) and by `brandChecks`, which flags layouts that drift (DESIGN.md §2–4, §12).
 * Everything here is pure and immutable; the editor UI lives in components/story-maker/custom/.
 */
import { z } from "zod";
import { STORY_HEIGHT, STORY_SAFE_BAND, STORY_WIDTH, type StoryPhoto } from "@/src/lib/story-maker";

export const MIN_TEXT_PX = 24;
export const MAX_ELEMENTS = 60;
const SNAP_THRESHOLD = 12;
const HISTORY_LIMIT = 60;
const MARGIN = 72;

export const TEXT_STYLES = {
  headline: { label: "Headline", size: 84, weight: 600, tracking: -0.02, lineHeight: 1.06, caps: false },
  title: { label: "Title", size: 116, weight: 600, tracking: -0.02, lineHeight: 1.05, caps: false },
  subhead: { label: "Subhead", size: 56, weight: 600, tracking: -0.015, lineHeight: 1.12, caps: false },
  quote: { label: "Quote", size: 64, weight: 600, tracking: -0.015, lineHeight: 1.14, caps: false },
  body: { label: "Body", size: 46, weight: 400, tracking: 0, lineHeight: 1.3, caps: false },
  stat: { label: "Big number", size: 300, weight: 600, tracking: -0.035, lineHeight: 0.92, caps: false },
  kicker: { label: "Kicker", size: 28, weight: 700, tracking: 0.18, lineHeight: 1.2, caps: true },
  label: { label: "Label", size: 26, weight: 500, tracking: 0.11, lineHeight: 1.3, caps: true }
} as const;
export type TextStyleId = keyof typeof TEXT_STYLES;

/** Text colors allowed on the dark story: Soft White, Mist, Green on Dark (DESIGN.md §2). */
export const TEXT_COLORS = { white: "#ECEFEA", mist: "#DCE2DE", green: "#2BB36E" } as const;
export type TextColorId = keyof typeof TEXT_COLORS;

/** Square plate fills: Ink, raised Ink, InFocus Green. */
export const PLATE_FILLS = { ink: "#0F110F", "ink-2": "#1A1D1A", green: "#0B6E3E" } as const;
export type PlateFillId = keyof typeof PLATE_FILLS;

export type TextAlign = "left" | "center" | "right";
export type Rect = { x: number; y: number; w: number; h: number };

type Base = Rect & { id: string };
export type CustomElement =
  | (Base & { kind: "text"; text: string; style: TextStyleId; color: TextColorId; align: TextAlign; scale: number })
  | (Base & { kind: "photo"; photo: StoryPhoto | null })
  | (Base & { kind: "plate"; fill: PlateFillId })
  | (Base & { kind: "icon" })
  | (Base & { kind: "header"; kicker: string; meta: string })
  | (Base & { kind: "footer" })
  | (Base & { kind: "follow"; heading: string });
export type CustomElementKind = CustomElement["kind"];
export type TextElement = Extract<CustomElement, { kind: "text" }>;
export type CustomBackground = { kind: "ink" } | { kind: "photo"; photo: StoryPhoto | null };
export type CustomLayout = { background: CustomBackground; elements: CustomElement[] };
/** Rendered heights of auto-height pieces (text, header, follow panel), keyed by element id. */
export type MeasuredHeights = Record<string, number>;

export type ElementPreset = "text" | "photo" | "plate" | "strip" | "icon" | "header" | "footer" | "follow";

const MIN_SIZE: Record<CustomElementKind, { w: number; h: number }> = {
  text: { w: 160, h: 0 },
  photo: { w: 80, h: 80 },
  plate: { w: 24, h: 8 },
  icon: { w: 64, h: 64 },
  header: { w: 0, h: 0 },
  footer: { w: 400, h: 0 },
  follow: { w: 480, h: 0 }
};
/** Pieces whose height follows their content: only the width can be dragged. */
const WIDTH_ONLY = new Set<CustomElementKind>(["text", "footer", "follow"]);

export function textPx(el: TextElement) {
  return Math.max(MIN_TEXT_PX, Math.round(TEXT_STYLES[el.style].size * el.scale));
}

/** `background` picks a visible plate: raised Ink on the Ink background, brand Ink over a photo. */
export function createElement(preset: ElementPreset, id: string, background?: CustomBackground): CustomElement {
  const full = STORY_WIDTH - MARGIN * 2;
  switch (preset) {
    case "text":
      return { id, kind: "text", x: MARGIN, y: 760, w: full, h: 100, text: "Your text here", style: "headline", color: "white", align: "left", scale: 1 };
    case "photo":
      return { id, kind: "photo", x: MARGIN, y: 400, w: full, h: 702, photo: null };
    case "plate":
      return { id, kind: "plate", x: MARGIN, y: 1180, w: full, h: 280, fill: background?.kind === "ink" ? "ink-2" : "ink" };
    case "strip":
      return { id, kind: "plate", x: MARGIN, y: 1460, w: full, h: 64, fill: "green" };
    case "icon":
      return { id, kind: "icon", x: MARGIN, y: STORY_SAFE_BAND, w: 104, h: 104 };
    case "header":
      return { id, kind: "header", x: MARGIN, y: STORY_SAFE_BAND, w: 420, h: 104, kicker: "News", meta: "" };
    case "footer":
      return { id, kind: "footer", x: MARGIN, y: STORY_HEIGHT - STORY_SAFE_BAND - 64, w: full, h: 64 };
    case "follow":
      return { id, kind: "follow", x: MARGIN, y: STORY_HEIGHT - STORY_SAFE_BAND - 300, w: full, h: 300, heading: "Watch and follow" };
  }
}

/**
 * A photo-led start: header with the date, a large photo, a green strip with the photo credit
 * attached under it, the headline on Ink, and the footer. Only the photo is left to add.
 */
export function starterLayout(newId: (n: number) => string, meta = ""): CustomLayout {
  const full = STORY_WIDTH - MARGIN * 2;
  const photoTop = 402;
  const photoHeight = 702;
  const stripTop = photoTop + photoHeight;
  const stripHeight = 56;
  return {
    background: { kind: "ink" },
    elements: [
      { ...createElement("header", newId(0)), meta } as CustomElement,
      { ...createElement("photo", newId(1)), y: photoTop, h: photoHeight },
      { ...createElement("strip", newId(2)), y: stripTop, h: stripHeight },
      { id: newId(3), kind: "text", x: MARGIN + 36, y: stripTop + 11, w: full - 72, h: 34, text: "Photos by First Last", style: "label", color: "white", align: "left", scale: 1 },
      { id: newId(4), kind: "text", x: MARGIN, y: stripTop + stripHeight + 36, w: full, h: 270, text: "Your headline goes here in sentence case", style: "headline", color: "white", align: "left", scale: 1 },
      createElement("footer", newId(5))
    ]
  };
}

// ---------- Immutable edits ----------

export function addElement(layout: CustomLayout, el: CustomElement): CustomLayout {
  if (layout.elements.length >= MAX_ELEMENTS) return layout;
  return { ...layout, elements: [...layout.elements, el] };
}

export function updateElement(layout: CustomLayout, id: string, patch: Partial<CustomElement>): CustomLayout {
  return { ...layout, elements: layout.elements.map((el) => (el.id === id ? ({ ...el, ...patch, id, kind: el.kind } as CustomElement) : el)) };
}

export function removeElement(layout: CustomLayout, id: string): CustomLayout {
  return { ...layout, elements: layout.elements.filter((el) => el.id !== id) };
}

export function duplicateElement(layout: CustomLayout, id: string, newId: string): CustomLayout {
  const index = layout.elements.findIndex((el) => el.id === id);
  if (index < 0 || layout.elements.length >= MAX_ELEMENTS) return layout;
  const source = layout.elements[index];
  const copy = { ...source, id: newId, ...clampToCanvas({ ...source, x: source.x + 32, y: source.y + 32 }) } as CustomElement;
  return { ...layout, elements: [...layout.elements.slice(0, index + 1), copy, ...layout.elements.slice(index + 1)] };
}

export function moveLayer(layout: CustomLayout, id: string, to: "front" | "back" | "forward" | "backward"): CustomLayout {
  const index = layout.elements.findIndex((el) => el.id === id);
  if (index < 0) return layout;
  const rest = layout.elements.filter((el) => el.id !== id);
  const target = { front: rest.length, back: 0, forward: Math.min(rest.length, index + 1), backward: Math.max(0, index - 1) }[to];
  return { ...layout, elements: [...rest.slice(0, target), layout.elements[index], ...rest.slice(target)] };
}

// ---------- Geometry, snapping, resizing ----------

function headerWidth(el: Extract<CustomElement, { kind: "header" }>) {
  // Tile + padding + the wider of the caps kicker and meta lines (Lexend caps with tracking ≈ 0.8em per character).
  return Math.round(104 + 54 + Math.max(el.kicker.length * 28 * 0.84, el.meta.length * 21 * 0.8));
}

export function rectOf(el: CustomElement, measured: MeasuredHeights): Rect {
  return { x: el.x, y: el.y, w: el.kind === "header" ? headerWidth(el) : el.w, h: measured[el.id] ?? el.h };
}

export function clampToCanvas(rect: Rect) {
  return {
    x: Math.max(0, Math.min(rect.x, STORY_WIDTH - rect.w)),
    y: Math.max(0, Math.min(rect.y, STORY_HEIGHT - rect.h))
  };
}

export type SnapTargets = { xs: number[]; ys: number[] };

/** Canvas edges, margins, centre lines, Instagram's safe lines, and every other piece's edges and centre. */
export function snapTargets(layout: CustomLayout, excludeId: string | null, measured: MeasuredHeights): SnapTargets {
  const xs = [0, MARGIN, STORY_WIDTH / 2, STORY_WIDTH - MARGIN, STORY_WIDTH];
  const ys = [0, STORY_SAFE_BAND, STORY_HEIGHT / 2, STORY_HEIGHT - STORY_SAFE_BAND, STORY_HEIGHT];
  for (const el of layout.elements) {
    if (el.id === excludeId) continue;
    const r = rectOf(el, measured);
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { xs, ys };
}

/** The shift that brings the closest of `edges` onto a target within the threshold, and that target. */
function nearest(edges: number[], targets: number[]) {
  let best: { shift: number; target: number } | null = null;
  for (const edge of edges) {
    for (const target of targets) {
      const shift = target - edge;
      if (Math.abs(shift) <= SNAP_THRESHOLD && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, target };
    }
  }
  return best;
}

export function snapMove(rect: Rect, targets: SnapTargets) {
  const sx = nearest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs);
  const sy = nearest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys);
  return {
    x: Math.round(rect.x + (sx?.shift ?? 0)),
    y: Math.round(rect.y + (sy?.shift ?? 0)),
    guides: { x: sx ? [sx.target] : [], y: sy ? [sy.target] : [] }
  };
}

/** New size for a corner drag, following each piece's rules, snapped and kept on the canvas. */
export function resizeElement(el: CustomElement, width: number, height: number, targets: SnapTargets) {
  const min = MIN_SIZE[el.kind];
  if (el.kind === "header") return { w: el.w, h: el.h, guides: { x: [] as number[], y: [] as number[] } };
  if (el.kind === "icon") {
    const side = Math.round(Math.max(min.w, Math.min(Math.max(width, height), STORY_WIDTH - el.x, STORY_HEIGHT - el.y)));
    return { w: side, h: side, guides: { x: [] as number[], y: [] as number[] } };
  }
  const sx = nearest([el.x + width], targets.xs);
  const sy = WIDTH_ONLY.has(el.kind) ? null : nearest([el.y + height], targets.ys);
  const w = Math.round(Math.max(min.w, Math.min(width + (sx?.shift ?? 0), STORY_WIDTH - el.x)));
  const h = WIDTH_ONLY.has(el.kind) ? el.h : Math.round(Math.max(min.h, Math.min(height + (sy?.shift ?? 0), STORY_HEIGHT - el.y)));
  return { w, h, guides: { x: sx ? [sx.target] : [], y: sy ? [sy.target] : [] } };
}

// ---------- Brand checks ----------

export type BrandIssue = { key: string; elementId?: string; message: string };

const TEXT_BEARING = new Set<CustomElementKind>(["text", "header", "footer", "follow"]);
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const FULL: Rect = { x: 0, y: 0, w: STORY_WIDTH, h: STORY_HEIGHT };

function describe(el: CustomElement) {
  if (el.kind === "text") {
    const snippet = el.text.trim().replace(/\s+/g, " ");
    return snippet ? `“${snippet.length > 28 ? `${snippet.slice(0, 28)}…` : snippet}”` : "An empty text box";
  }
  return { photo: "A photo", plate: "A plate", icon: "The icon", header: "The header", footer: "The footer", follow: "The follow panel" }[el.kind];
}

/** Layout problems that break DESIGN.md. Warnings, not blocks: the person decides. */
export function brandChecks(layout: CustomLayout, measured: MeasuredHeights): BrandIssue[] {
  const issues: BrandIssue[] = [];
  const els = layout.elements;
  const rects = els.map((el) => rectOf(el, measured));
  const bgPhoto = layout.background.kind === "photo" && layout.background.photo !== null;

  els.forEach((el, i) => {
    const r = rects[i];
    if (!contains(FULL, r)) {
      issues.push({ key: `off-canvas:${el.id}`, elementId: el.id, message: `${describe(el)} runs off the edge of the story.` });
    }
    if (TEXT_BEARING.has(el.kind) && (r.y < STORY_SAFE_BAND || r.y + r.h > STORY_HEIGHT - STORY_SAFE_BAND)) {
      issues.push({ key: `safe-zone:${el.id}`, elementId: el.id, message: `${describe(el)} is where Instagram’s buttons cover it. Keep text between the safe lines.` });
    }
    if (el.kind === "photo" && !el.photo) {
      issues.push({ key: `empty-photo:${el.id}`, elementId: el.id, message: "A photo box is empty. It will export as a dark block." });
    }
    if (el.kind === "text" || el.kind === "footer") {
      // Topmost photo under this text, then whether a plate sits between it and the text and covers the text.
      const photoIndex = els.map((other, j) => (j < i && other.kind === "photo" && other.photo && intersects(rects[j], r) ? j : -1)).reduce((a, b) => Math.max(a, b), bgPhoto ? -0.5 : -1);
      const onPlate = els.some((other, j) => j < i && j > photoIndex && (other.kind === "plate" || other.kind === "follow") && contains(rects[j], r));
      if (photoIndex > -1 && !onPlate) {
        issues.push({ key: `text-on-photo:${el.id}`, elementId: el.id, message: `${describe(el)} sits straight on a photo. Put an Ink plate behind it.` });
      }
    }
    if (el.kind === "text" && el.color === "green") {
      const onGreen = els.some((other, j) => j < i && ((other.kind === "plate" && other.fill === "green") || other.kind === "follow") && intersects(rects[j], r));
      if (onGreen) issues.push({ key: `green-on-green:${el.id}`, elementId: el.id, message: `${describe(el)} is green on a green plate. Use Soft White.` });
    }
  });

  if (els.filter((el) => el.kind === "icon" || el.kind === "header").length > 1) {
    issues.push({ key: "one-red", message: "Use one icon or header. The red dot should appear only once." });
  }
  if (layout.background.kind === "photo" && !layout.background.photo) {
    issues.push({ key: "empty-background", message: "The photo background is empty. Choose a photo or switch back to Ink." });
  }
  return issues;
}

// ---------- Undo / redo ----------

export type History = { past: CustomLayout[]; present: CustomLayout; future: CustomLayout[]; pending: CustomLayout | null; lastKey: string | null };
export type HistoryAction =
  /** A finished edit. Consecutive commits with the same key (typing in one box) merge into one undo step. */
  | { type: "commit"; layout: CustomLayout; key?: string }
  /** Start of a drag: remembered, and only recorded if the drag actually changes something. */
  | { type: "checkpoint" }
  /** A step during a drag. */
  | { type: "transient"; layout: CustomLayout }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; layout: CustomLayout };

export const initialHistory = (layout: CustomLayout): History => ({ past: [], present: layout, future: [], pending: null, lastKey: null });

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "commit":
      if (action.key && action.key === state.lastKey) return { ...state, present: action.layout, future: [], pending: null };
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: action.layout, future: [], pending: null, lastKey: action.key ?? null };
    case "checkpoint":
      return { ...state, pending: state.present, lastKey: null };
    case "transient":
      return state.pending
        ? { past: [...state.past, state.pending].slice(-HISTORY_LIMIT), present: action.layout, future: [], pending: null, lastKey: null }
        : { ...state, present: action.layout };
    case "undo": {
      if (!state.past.length) return { ...state, pending: null, lastKey: null };
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future], pending: null, lastKey: null };
    }
    case "redo": {
      if (!state.future.length) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), pending: null, lastKey: null };
    }
    case "load":
      return initialHistory(action.layout);
  }
}

// ---------- Saving (photos are never saved) ----------

const photoSchema = z.object({ src: z.string(), x: z.number(), y: z.number(), zoom: z.number() }).nullable();
const base = { id: z.string().min(1).max(64), x: z.number().finite(), y: z.number().finite(), w: z.number().finite(), h: z.number().finite() };
const enumOf = <T extends Record<string, unknown>>(record: T) => z.enum(Object.keys(record) as [keyof T & string, ...(keyof T & string)[]]);
const elementSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("text"), text: z.string().max(2000), style: enumOf(TEXT_STYLES), color: enumOf(TEXT_COLORS), align: z.enum(["left", "center", "right"]), scale: z.number().min(0.75).max(1.5) }),
  z.object({ ...base, kind: z.literal("photo"), photo: photoSchema }),
  z.object({ ...base, kind: z.literal("plate"), fill: enumOf(PLATE_FILLS) }),
  z.object({ ...base, kind: z.literal("icon") }),
  z.object({ ...base, kind: z.literal("header"), kicker: z.string().max(40), meta: z.string().max(60) }),
  z.object({ ...base, kind: z.literal("footer") }),
  z.object({ ...base, kind: z.literal("follow"), heading: z.string().max(60) })
]);
const layoutSchema = z.object({
  background: z.discriminatedUnion("kind", [z.object({ kind: z.literal("ink") }), z.object({ kind: z.literal("photo"), photo: photoSchema })]),
  elements: z.array(elementSchema).max(MAX_ELEMENTS)
});

export function serializeLayout(layout: CustomLayout): string {
  return JSON.stringify({
    background: layout.background.kind === "photo" ? { kind: "photo", photo: null } : layout.background,
    elements: layout.elements.map((el) => (el.kind === "photo" ? { ...el, photo: null } : el))
  });
}

export function parseLayout(json: string): CustomLayout | null {
  try {
    const result = layoutSchema.safeParse(JSON.parse(json));
    return result.success ? (result.data as CustomLayout) : null;
  } catch {
    return null;
  }
}
