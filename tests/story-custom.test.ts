import { describe, expect, it } from "vitest";
import {
  MIN_TEXT_PX,
  addElement,
  brandChecks,
  clampToCanvas,
  createElement,
  duplicateElement,
  historyReducer,
  initialHistory,
  moveLayer,
  parseLayout,
  removeElement,
  resizeElement,
  serializeLayout,
  snapMove,
  snapTargets,
  starterLayout,
  textPx,
  updateElement,
  type CustomElement,
  type CustomLayout,
  type TextElement
} from "@/src/lib/story-custom";

const PHOTO = { src: "data:image/jpeg;base64,AAAA", x: 50, y: 50, zoom: 100 };
const layoutOf = (...elements: CustomElement[]): CustomLayout => ({ background: { kind: "ink" }, elements });
const text = (id: string, patch: Partial<CustomElement> = {}) => ({ ...createElement("text", id), ...patch }) as CustomElement;
const ids = (layout: CustomLayout) => layout.elements.map((el) => el.id);
const issueKeys = (layout: CustomLayout) => brandChecks(layout, {}).map((issue) => issue.key);

describe("editing elements", () => {
  it("adds on top and never mutates the original layout", () => {
    const before = layoutOf(text("a"));
    const after = addElement(before, text("b"));
    expect(ids(after)).toEqual(["a", "b"]);
    expect(ids(before)).toEqual(["a"]);
  });

  it("updates, removes, and duplicates by id without mutation", () => {
    const before = layoutOf(text("a"), text("b"));
    const updated = updateElement(before, "a", { x: 300 });
    expect(updated.elements[0].x).toBe(300);
    expect(before.elements[0].x).not.toBe(300);
    expect(ids(removeElement(before, "a"))).toEqual(["b"]);

    const copied = duplicateElement(before, "a", "a2");
    expect(ids(copied)).toEqual(["a", "a2", "b"]);
    expect(copied.elements[1]).toMatchObject({ x: before.elements[0].x + 32, y: before.elements[0].y + 32 });
  });

  it("reorders layers", () => {
    const layout = layoutOf(text("a"), text("b"), text("c"));
    expect(ids(moveLayer(layout, "a", "front"))).toEqual(["b", "c", "a"]);
    expect(ids(moveLayer(layout, "c", "back"))).toEqual(["c", "a", "b"]);
    expect(ids(moveLayer(layout, "a", "forward"))).toEqual(["b", "a", "c"]);
    expect(ids(moveLayer(layout, "a", "backward"))).toEqual(["a", "b", "c"]);
  });

  it("makes new Ink plates visible on an Ink background (raised Ink) and brand Ink over photos", () => {
    expect(createElement("plate", "p", { kind: "ink" })).toMatchObject({ fill: "ink-2" });
    expect(createElement("plate", "p", { kind: "photo", photo: null })).toMatchObject({ fill: "ink" });
  });

  it("creates brand presets: a green strip is a green plate, text starts as a Soft White headline", () => {
    expect(createElement("strip", "s")).toMatchObject({ kind: "plate", fill: "green" });
    expect(createElement("text", "t")).toMatchObject({ kind: "text", style: "headline", color: "white", scale: 1 });
  });

  it("never renders text smaller than 24px", () => {
    expect(textPx(text("k", { style: "kicker", scale: 0.75 } as Partial<CustomElement>) as TextElement)).toBe(MIN_TEXT_PX);
    expect(textPx(text("h", { style: "headline", scale: 1.5 } as Partial<CustomElement>) as TextElement)).toBe(126);
  });
});

describe("moving and resizing", () => {
  const targets = snapTargets(layoutOf(), null, {});

  it("snaps an edge or centre to the nearest guide within the threshold", () => {
    const snapped = snapMove({ x: 80, y: 500, w: 200, h: 100 }, targets);
    expect(snapped.x).toBe(72);
    expect(snapped.guides.x).toEqual([72]);

    const centred = snapMove({ x: 445, y: 500, w: 200, h: 100 }, targets);
    expect(centred.x).toBe(440);
    expect(centred.guides.x).toEqual([540]);
  });

  it("leaves positions alone when nothing is close", () => {
    expect(snapMove({ x: 300, y: 500, w: 101, h: 100 }, targets)).toMatchObject({ x: 300, y: 500, guides: { x: [], y: [] } });
  });

  it("snaps to other elements' edges", () => {
    const withPlate = snapTargets(layoutOf({ ...createElement("plate", "p"), x: 200, y: 700, w: 300, h: 200 }), null, {});
    expect(snapMove({ x: 505, y: 1000, w: 101, h: 50 }, withPlate).x).toBe(500);
  });

  it("keeps elements on the canvas", () => {
    expect(clampToCanvas({ x: -40, y: 1900, w: 200, h: 100 })).toEqual({ x: 0, y: 1820 });
    expect(clampToCanvas({ x: 20, y: 20, w: 1400, h: 100 })).toEqual({ x: 0, y: 20 });
  });

  it("resizes with brand rules: icons stay square, text only changes width", () => {
    expect(resizeElement(createElement("icon", "i"), 150, 90, snapTargets(layoutOf(), null, {}))).toMatchObject({ w: 150, h: 150 });
    const t = resizeElement(createElement("text", "t"), 500, 900, snapTargets(layoutOf(), null, {}));
    expect(t.w).toBe(500);
    expect(t.h).toBe(createElement("text", "t").h);
  });

  it("enforces a minimum size and the canvas edge", () => {
    const plate = { ...createElement("plate", "p"), x: 900, y: 1800 };
    const sized = resizeElement(plate, 5, 5000, snapTargets(layoutOf(), null, {}));
    expect(sized.w).toBeGreaterThanOrEqual(24);
    expect(plate.y + sized.h).toBeLessThanOrEqual(1920);
  });
});

describe("brand checks", () => {
  it("starts from a clean layout that only asks for a photo", () => {
    expect(issueKeys(starterLayout((n) => `el-${n}`, "Sept. 26, 2026"))).toEqual(["empty-photo:el-1"]);
  });

  it("starts with a photo, a credited green strip under it, and the headline below", () => {
    const starter = starterLayout((n) => `el-${n}`, "Sept. 26, 2026");
    const [header, photo, strip, credit, headline, footer] = starter.elements;
    expect(header).toMatchObject({ kind: "header", meta: "Sept. 26, 2026" });
    expect(strip).toMatchObject({ kind: "plate", fill: "green", y: photo.y + photo.h });
    expect(credit).toMatchObject({ kind: "text", style: "label", color: "white" });
    expect(credit.y).toBeGreaterThanOrEqual(strip.y);
    expect(credit.y + 34).toBeLessThanOrEqual(strip.y + strip.h);
    expect(headline).toMatchObject({ kind: "text", style: "headline" });
    expect(headline.y).toBeGreaterThan(strip.y + strip.h);
    expect(headline.y + headline.h).toBeLessThan(footer.y);
  });

  it("flags text in Instagram's UI zones", () => {
    expect(issueKeys(layoutOf(text("t", { y: 100 })))).toContain("safe-zone:t");
    expect(issueKeys(layoutOf(text("t", { y: 1650 })))).toContain("safe-zone:t");
  });

  it("uses measured heights for text boxes", () => {
    const layout = layoutOf(text("t", { y: 1500, h: 60 }));
    expect(brandChecks(layout, {}).map((i) => i.key)).not.toContain("safe-zone:t");
    expect(brandChecks(layout, { t: 400 }).map((i) => i.key)).toContain("safe-zone:t");
  });

  it("allows only one red dot (one icon or header)", () => {
    expect(issueKeys(layoutOf(createElement("icon", "i"), createElement("header", "h")))).toContain("one-red");
  });

  it("wants a plate under text on a photo", () => {
    const photo = { ...createElement("photo", "p"), photo: PHOTO, x: 0, y: 0, w: 1080, h: 1920 } as CustomElement;
    const onPhoto = layoutOf(photo, text("t", { x: 100, y: 800, w: 600, h: 100 }));
    expect(issueKeys(onPhoto)).toContain("text-on-photo:t");

    const plate = { ...createElement("plate", "pl"), x: 72, y: 760, w: 936, h: 200 } as CustomElement;
    expect(issueKeys(layoutOf(photo, plate, text("t", { x: 100, y: 800, w: 600, h: 100 })))).not.toContain("text-on-photo:t");
  });

  it("treats a photo background like a full-bleed photo", () => {
    const layout: CustomLayout = { background: { kind: "photo", photo: PHOTO }, elements: [text("t", { y: 800 })] };
    expect(issueKeys(layout)).toContain("text-on-photo:t");
  });

  it("flags green text on a green plate", () => {
    const strip = { ...createElement("strip", "s"), x: 72, y: 800, w: 936, h: 200 } as CustomElement;
    expect(issueKeys(layoutOf(strip, text("t", { x: 100, y: 820, w: 500, h: 80, color: "green" } as Partial<CustomElement>)))).toContain("green-on-green:t");
  });

  it("flags empty photo boxes", () => {
    expect(issueKeys(layoutOf(createElement("photo", "p")))).toContain("empty-photo:p");
  });
});

describe("history", () => {
  const a = layoutOf(text("a"));
  const b = layoutOf(text("a"), text("b"));
  const c = layoutOf(text("c"));

  it("undoes and redoes commits", () => {
    let h = historyReducer(initialHistory(a), { type: "commit", layout: b });
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(a);
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(b);
  });

  it("merges commits with the same key (typing) into one undo step", () => {
    let h = historyReducer(initialHistory(a), { type: "commit", layout: b, key: "text:a" });
    h = historyReducer(h, { type: "commit", layout: c, key: "text:a" });
    expect(historyReducer(h, { type: "undo" }).present).toBe(a);
  });

  it("records a drag as one step, and a click without movement as none", () => {
    let h = historyReducer(initialHistory(a), { type: "checkpoint" });
    h = historyReducer(h, { type: "transient", layout: b });
    h = historyReducer(h, { type: "transient", layout: c });
    expect(h.past).toEqual([a]);
    expect(historyReducer(h, { type: "undo" }).present).toBe(a);

    const clickOnly = historyReducer(historyReducer(initialHistory(a), { type: "checkpoint" }), { type: "undo" });
    expect(clickOnly.present).toBe(a);
    expect(clickOnly.past).toEqual([]);
  });

  it("clears redo after a new change", () => {
    let h = historyReducer(initialHistory(a), { type: "commit", layout: b });
    h = historyReducer(historyReducer(h, { type: "undo" }), { type: "commit", layout: c });
    expect(h.future).toEqual([]);
  });
});

describe("saving layouts", () => {
  it("drops photos when saving and restores the layout", () => {
    const layout: CustomLayout = {
      background: { kind: "photo", photo: PHOTO },
      elements: [{ ...createElement("photo", "p"), photo: PHOTO } as CustomElement, text("t")]
    };
    const restored = parseLayout(serializeLayout(layout));
    expect(restored?.background).toEqual({ kind: "photo", photo: null });
    expect(restored?.elements[0]).toMatchObject({ id: "p", photo: null });
    expect(restored?.elements[1]).toEqual(layout.elements[1]);
  });

  it("rejects saved data that isn't a valid layout", () => {
    expect(parseLayout("not json")).toBeNull();
    expect(parseLayout(JSON.stringify({ background: { kind: "ink" }, elements: [{ id: "x", kind: "rocket" }] }))).toBeNull();
    expect(parseLayout(JSON.stringify({ background: { kind: "ink" }, elements: [{ ...createElement("text", "t"), color: "#FF0000" }] }))).toBeNull();
  });
});
