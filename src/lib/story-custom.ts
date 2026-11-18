/**
 * Custom (freeform) Instagram layouts: brand pieces placed anywhere on a post (1080 × 1350) or a
 * story (1080 × 1920), on Warm White or Ink. The brand is kept by construction (Lexend and Geist
 * Mono presets, brand colors, square shapes, no rotation or shadows, text ≥ 24px) and by
 * `brandChecks`, which flags layouts that drift (docs/SOCIAL-MEDIA-DESIGN.md).
 * Everything here is pure and immutable; the editor UI lives in components/story-maker/custom/.
 * Functions that need the canvas take a CanvasSpec (default: the story, the original format).
 */
import { z } from "zod";
import { CANVAS, SIDE_MARGIN, type CanvasSpec, type StoryPhoto } from "@/src/lib/story-maker";

export const MIN_TEXT_PX = 24;
export const MAX_ELEMENTS = 60;
const SNAP_THRESHOLD = 12;
const HISTORY_LIMIT = 60;
const MARGIN = SIDE_MARGIN;
const STORY = CANVAS.story;

/** Lexend for words, Geist Mono (`mono`) for numbers that are data. */
export const TEXT_STYLES = {
  title: { label: "Title", size: 112, weight: 600, tracking: -0.02, lineHeight: 1, caps: false, mono: false },
  headline: { label: "Headline", size: 84, weight: 600, tracking: -0.02, lineHeight: 1.06, caps: false, mono: false },
  subhead: { label: "Subhead", size: 56, weight: 600, tracking: -0.015, lineHeight: 1.12, caps: false, mono: false },
  quote: { label: "Quote", size: 64, weight: 600, tracking: -0.015, lineHeight: 1.14, caps: false, mono: false },
  body: { label: "Body", size: 40, weight: 400, tracking: 0, lineHeight: 1.3, caps: false, mono: false },
  note: { label: "Note", size: 28, weight: 400, tracking: 0, lineHeight: 1.35, caps: false, mono: false },
  stat: { label: "Big number", size: 280, weight: 600, tracking: -0.035, lineHeight: 0.92, caps: false, mono: false },
  number: { label: "Number (mono)", size: 64, weight: 500, tracking: 0, lineHeight: 1.1, caps: false, mono: true },
  meta: { label: "Date or time (mono)", size: 30, weight: 400, tracking: 0, lineHeight: 1.3, caps: false, mono: true },
  kicker: { label: "Kicker", size: 28, weight: 600, tracking: 0.18, lineHeight: 1.2, caps: true, mono: false },
  label: { label: "Label", size: 26, weight: 600, tracking: 0.11, lineHeight: 1.3, caps: true, mono: false }
} as const;
export type TextStyleId = keyof typeof TEXT_STYLES;

/**
 * Text colors. Theme colors (`css` is a canvas variable) follow the background; "On dark" and
 * "On light" are fixed for text on a plate or photo. Swatches show the light and dark value.
 * The ids white, mist and green predate the light theme and are kept so saved layouts still load.
 */
export const TEXT_COLORS = {
  white: { label: "Primary", css: "var(--sm-text)", light: "#0F110F", dark: "#ECEFEA" },
  mist: { label: "Secondary", css: "var(--sm-text-2)", light: "#3B3933", dark: "#DCE2DE" },
  muted: { label: "Muted", css: "var(--sm-muted)", light: "#6E695F", dark: "#A3ABA6" },
  green: { label: "Green", css: "var(--sm-accent)", light: "#0B6E3E", dark: "#2BB36E" },
  dem: { label: "Democrat", css: "var(--sm-dem-text)", light: "#0059C2", dark: "#4D93E8" },
  rep: { label: "Republican", css: "var(--sm-rep-text)", light: "#B8281F", dark: "#E5605B" },
  "on-dark": { label: "On dark", css: "#ECEFEA", light: "#ECEFEA", dark: "#ECEFEA" },
  "on-light": { label: "On light", css: "#0F110F", light: "#0F110F", dark: "#0F110F" }
} as const;
export type TextColorId = keyof typeof TEXT_COLORS;

/** Square shape fills. Brand colors are fixed; Panel and Line follow the background. */
export const PLATE_FILLS = {
  ink: { label: "Ink", css: "#0F110F", light: "#0F110F", dark: "#0F110F" },
  "ink-2": { label: "Raised Ink", css: "#1A1D1A", light: "#1A1D1A", dark: "#1A1D1A" },
  paper: { label: "Warm White", css: "#FAF7F0", light: "#FAF7F0", dark: "#FAF7F0" },
  panel: { label: "Panel", css: "var(--sm-panel)", light: "#F1ECE1", dark: "#1A1D1A" },
  line: { label: "Line", css: "var(--sm-line)", light: "#DDD6C8", dark: "#2B302B" },
  green: { label: "InFocus Green", css: "#0B6E3E", light: "#0B6E3E", dark: "#0B6E3E" },
  dem: { label: "Democrat", css: "var(--sm-dem)", light: "#0059C2", dark: "#0059C2" },
  rep: { label: "Republican", css: "var(--sm-rep)", light: "#CD332E", dark: "#CD332E" },
  yes: { label: "Yes", css: "var(--sm-yes)", light: "#1A8F55", dark: "#2BB36E" },
  no: { label: "No", css: "var(--sm-no)", light: "#8A918C", dark: "#6B726D" }
} as const;
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
  | (Base & { kind: "footer"; source?: string })
  | (Base & { kind: "follow"; heading: string })
  | (Base & { kind: "wordmark" });
export type CustomElementKind = CustomElement["kind"];
export type TextElement = Extract<CustomElement, { kind: "text" }>;
export type CustomBackground = { kind: "ink" } | { kind: "photo"; photo: StoryPhoto | null };
export type CustomLayout = { background: CustomBackground; elements: CustomElement[] };
/** "ink" is the plain background (Warm White or Ink, whichever the theme is); the name predates the light theme. */
/** Rendered heights of auto-height pieces (text, header, follow panel), keyed by element id. */
export type MeasuredHeights = Record<string, number>;

export type ElementPreset = "text" | "number" | "photo" | "plate" | "strip" | "rule" | "icon" | "wordmark" | "header" | "footer" | "follow";

const MIN_SIZE: Record<CustomElementKind, { w: number; h: number }> = {
  text: { w: 160, h: 0 },
  photo: { w: 80, h: 80 },
  plate: { w: 3, h: 3 },
  icon: { w: 64, h: 64 },
  header: { w: 400, h: 0 },
  footer: { w: 400, h: 0 },
  follow: { w: 480, h: 0 },
  wordmark: { w: 160, h: 43 }
};
/** Pieces whose height follows their content: only the width can be dragged. */
export const WIDTH_ONLY = new Set<CustomElementKind>(["text", "header", "footer", "follow"]);
/** The wordmark file is 1200 × 321. */
const WORDMARK_RATIO = 321 / 1200;

export function textPx(el: TextElement) {
  return Math.max(MIN_TEXT_PX, Math.round(TEXT_STYLES[el.style].size * el.scale));
}

/** Where text may sit: below the top margin (or Instagram's band on stories), above the bottom one. */
export function textArea(spec: CanvasSpec = STORY) {
  return { top: Math.max(spec.top, spec.safeBand), bottom: spec.height - Math.max(spec.bottom, spec.safeBand) };
}

/** `background` picks a visible plate: raised Ink on the plain background, brand Ink over a photo. */
export function createElement(preset: ElementPreset, id: string, background?: CustomBackground, spec: CanvasSpec = STORY): CustomElement {
  const full = spec.width - MARGIN * 2;
  const area = textArea(spec);
  const middle = Math.round(spec.height / 2);
  switch (preset) {
    case "text":
      return { id, kind: "text", x: MARGIN, y: middle - 180, w: full, h: 100, text: "Your text here", style: "headline", color: "white", align: "left", scale: 1 };
    case "number":
      return { id, kind: "text", x: MARGIN, y: middle, w: 400, h: 70, text: "50.1%", style: "number", color: "white", align: "left", scale: 1 };
    case "photo":
      return { id, kind: "photo", x: MARGIN, y: area.top + 150, w: full, h: Math.round(full * 0.66), photo: null };
    case "plate":
      return { id, kind: "plate", x: MARGIN, y: middle + 40, w: full, h: 280, fill: background?.kind === "ink" ? "ink-2" : "ink" };
    case "strip":
      return { id, kind: "plate", x: MARGIN, y: middle + 320, w: full, h: 64, fill: "green" };
    case "rule":
      return { id, kind: "plate", x: MARGIN, y: middle, w: full, h: 3, fill: "line" };
    case "icon":
      return { id, kind: "icon", x: MARGIN, y: area.top, w: 104, h: 104 };
    case "wordmark":
      return { id, kind: "wordmark", x: spec.width - MARGIN - 194, y: area.top, w: 194, h: Math.round(194 * WORDMARK_RATIO) };
    case "header":
      return { id, kind: "header", x: MARGIN, y: area.top, w: full, h: 104, kicker: "News", meta: "" };
    case "footer":
      return { id, kind: "footer", x: MARGIN, y: area.bottom - 52, w: full, h: 52, source: "" };
    case "follow":
      return { id, kind: "follow", x: MARGIN, y: area.bottom - 300, w: full, h: 300, heading: "Watch and follow" };
  }
}

/**
 * A photo-led start, laid out like the Headline template: header, a large photo with its credit
 * under it, the headline and the date, and the footer. Only the photo is left to add.
 */
export function starterLayout(newId: (n: number) => string, meta = "", spec: CanvasSpec = STORY): CustomLayout {
  const full = spec.width - MARGIN * 2;
  const area = textArea(spec);
  const photoTop = area.top + 128;
  const photoHeight = spec.height > 1500 ? 740 : 560;
  const creditTop = photoTop + photoHeight + 12;
  const headlineTop = creditTop + 64;
  return {
    background: { kind: "ink" },
    elements: [
      createElement("header", newId(0), undefined, spec),
      { ...createElement("photo", newId(1), undefined, spec), y: photoTop, h: photoHeight },
      { id: newId(2), kind: "text", x: MARGIN, y: creditTop, w: full, h: 34, text: "Photo by First Last", style: "note", color: "muted", align: "left", scale: 0.85 },
      { id: newId(3), kind: "text", x: MARGIN, y: headlineTop, w: full, h: 180, text: "Your headline goes here in sentence case", style: "headline", color: "white", align: "left", scale: 0.86 },
      { id: newId(4), kind: "text", x: MARGIN, y: headlineTop + 200, w: full, h: 40, text: meta, style: "meta", color: "mist", align: "left", scale: 1 },
      createElement("footer", newId(5), undefined, spec)
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

export function duplicateElement(layout: CustomLayout, id: string, newId: string, spec: CanvasSpec = STORY): CustomLayout {
  const index = layout.elements.findIndex((el) => el.id === id);
  if (index < 0 || layout.elements.length >= MAX_ELEMENTS) return layout;
  const source = layout.elements[index];
  const copy = { ...source, id: newId, ...clampToCanvas({ ...source, x: source.x + 32, y: source.y + 32 }, spec) } as CustomElement;
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

export function rectOf(el: CustomElement, measured: MeasuredHeights): Rect {
  return { x: el.x, y: el.y, w: el.w, h: measured[el.id] ?? el.h };
}

export function clampToCanvas(rect: Rect, spec: CanvasSpec = STORY) {
  return {
    x: Math.max(0, Math.min(rect.x, spec.width - rect.w)),
    y: Math.max(0, Math.min(rect.y, spec.height - rect.h))
  };
}

export type SnapTargets = { xs: number[]; ys: number[] };

/** Canvas edges, margins, centre lines, the top and bottom margins (Instagram's safe lines on stories), and every other piece's edges and centre. */
export function snapTargets(layout: CustomLayout, excludeId: string | null, measured: MeasuredHeights, spec: CanvasSpec = STORY): SnapTargets {
  const area = textArea(spec);
  const xs = [0, MARGIN, spec.width / 2, spec.width - MARGIN, spec.width];
  const ys = [0, area.top, spec.height / 2, area.bottom, spec.height];
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
export function resizeElement(el: CustomElement, width: number, height: number, targets: SnapTargets, spec: CanvasSpec = STORY) {
  const min = MIN_SIZE[el.kind];
  if (el.kind === "icon") {
    const side = Math.round(Math.max(min.w, Math.min(Math.max(width, height), spec.width - el.x, spec.height - el.y)));
    return { w: side, h: side, guides: { x: [] as number[], y: [] as number[] } };
  }
  if (el.kind === "wordmark") {
    const w = Math.round(Math.max(min.w, Math.min(width, spec.width - el.x, (spec.height - el.y) / WORDMARK_RATIO)));
    return { w, h: Math.round(w * WORDMARK_RATIO), guides: { x: [] as number[], y: [] as number[] } };
  }
  const sx = nearest([el.x + width], targets.xs);
  const sy = WIDTH_ONLY.has(el.kind) ? null : nearest([el.y + height], targets.ys);
  const w = Math.round(Math.max(min.w, Math.min(width + (sx?.shift ?? 0), spec.width - el.x)));
  const h = WIDTH_ONLY.has(el.kind) ? el.h : Math.round(Math.max(min.h, Math.min(height + (sy?.shift ?? 0), spec.height - el.y)));
  return { w, h, guides: { x: sx ? [sx.target] : [], y: sy ? [sy.target] : [] } };
}

// ---------- Brand checks ----------

export type BrandIssue = { key: string; elementId?: string; message: string };

const TEXT_BEARING = new Set<CustomElementKind>(["text", "header", "footer", "follow"]);
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

function describe(el: CustomElement) {
  if (el.kind === "text") {
    const snippet = el.text.trim().replace(/\s+/g, " ");
    return snippet ? `“${snippet.length > 28 ? `${snippet.slice(0, 28)}…` : snippet}”` : "An empty text box";
  }
  return { photo: "A photo", plate: "A shape", icon: "The icon", header: "The header", footer: "The footer", follow: "The follow panel", wordmark: "The wordmark" }[el.kind];
}

/** Layout problems that break the social media guide. Warnings, not blocks: the person decides. */
export function brandChecks(layout: CustomLayout, measured: MeasuredHeights, spec: CanvasSpec = STORY): BrandIssue[] {
  const issues: BrandIssue[] = [];
  const full: Rect = { x: 0, y: 0, w: spec.width, h: spec.height };
  const noun = spec.safeBand ? "story" : "post";
  const els = layout.elements;
  const rects = els.map((el) => rectOf(el, measured));
  const bgPhoto = layout.background.kind === "photo" && layout.background.photo !== null;

  els.forEach((el, i) => {
    const r = rects[i];
    if (!contains(full, r)) {
      issues.push({ key: `off-canvas:${el.id}`, elementId: el.id, message: `${describe(el)} runs off the edge of the ${noun}.` });
    }
    if (spec.safeBand && TEXT_BEARING.has(el.kind) && (r.y < spec.safeBand || r.y + r.h > spec.height - spec.safeBand)) {
      issues.push({ key: `safe-zone:${el.id}`, elementId: el.id, message: `${describe(el)} is where Instagram’s buttons cover it. Keep text between the safe lines.` });
    }
    if (el.kind === "photo" && !el.photo) {
      issues.push({ key: `empty-photo:${el.id}`, elementId: el.id, message: "A photo box is empty. It will export as a blank block." });
    }
    if (el.kind === "text" || el.kind === "footer") {
      // Topmost photo under this text, then whether a plate sits between it and the text and covers the text.
      const photoIndex = els.map((other, j) => (j < i && other.kind === "photo" && other.photo && intersects(rects[j], r) ? j : -1)).reduce((a, b) => Math.max(a, b), bgPhoto ? -0.5 : -1);
      const onPlate = els.some((other, j) => j < i && j > photoIndex && (other.kind === "plate" || other.kind === "follow") && contains(rects[j], r));
      if (photoIndex > -1 && !onPlate) {
        issues.push({ key: `text-on-photo:${el.id}`, elementId: el.id, message: `${describe(el)} sits straight on a photo. Put a plate behind it.` });
      }
    }
    if (el.kind === "text" && el.color === "green") {
      const onGreen = els.some((other, j) => j < i && ((other.kind === "plate" && other.fill === "green") || other.kind === "follow") && intersects(rects[j], r));
      if (onGreen) issues.push({ key: `green-on-green:${el.id}`, elementId: el.id, message: `${describe(el)} is green on a green plate. Use On dark.` });
    }
    if (el.kind === "text" && TEXT_STYLES[el.style].mono && /[A-Za-z]{4,}/.test(el.text) && !/\b(AM|PM|PT|Jan|Feb|March|April|May|June|July|Aug|Sept|Oct|Nov|Dec)\b/.test(el.text)) {
      issues.push({ key: `mono-words:${el.id}`, elementId: el.id, message: `${describe(el)} is words in the mono style. Mono is for numbers and times; use Body or Label.` });
    }
  });

  if (els.filter((el) => el.kind === "icon" || el.kind === "header" || el.kind === "wordmark").length > 1) {
    issues.push({ key: "one-red", message: "Use the logo once: one header, wordmark or icon. The red dot should appear only once." });
  }
  if (!els.some((el) => el.kind === "footer" || el.kind === "follow")) {
    issues.push({ key: "no-footer", message: "Add the footer so the post carries @infocusnews (and the source, if there is one)." });
  }
  if (layout.background.kind === "photo" && !layout.background.photo) {
    issues.push({ key: "empty-background", message: "The photo background is empty. Choose a photo or switch back to Plain." });
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
  z.object({ ...base, kind: z.literal("footer"), source: z.string().max(80).optional() }),
  z.object({ ...base, kind: z.literal("follow"), heading: z.string().max(60) }),
  z.object({ ...base, kind: z.literal("wordmark") })
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
