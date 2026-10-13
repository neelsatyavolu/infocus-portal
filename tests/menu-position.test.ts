import { describe, expect, it } from "vitest";
import { clampMenuPosition } from "@/src/lib/menu-position";

const viewport = { width: 390, height: 844 };
const menu = { width: 168, height: 120 };

describe("clampMenuPosition", () => {
  it("keeps a position that already fits", () => {
    expect(clampMenuPosition({ x: 40, y: 200 }, menu, viewport)).toEqual({ x: 40, y: 200 });
  });

  it("pulls the menu back from the right and bottom edges", () => {
    expect(clampMenuPosition({ x: 380, y: 830 }, menu, viewport)).toEqual({ x: 214, y: 716 });
  });

  it("pushes the menu in from the left and top edges", () => {
    expect(clampMenuPosition({ x: -20, y: 0 }, menu, viewport)).toEqual({ x: 8, y: 8 });
  });

  it("pins to the top-left margin when the menu is larger than the viewport", () => {
    expect(clampMenuPosition({ x: 100, y: 100 }, { width: 500, height: 900 }, viewport)).toEqual({ x: 8, y: 8 });
  });
});
