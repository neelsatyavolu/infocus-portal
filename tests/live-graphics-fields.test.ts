import { describe, expect, it } from "vitest";
import { defaultGraphicFields, sanitizeGraphicFields, startOffsetMs } from "@/src/lib/live/graphics";

describe("starting soon start offset", () => {
  it("reads minutes, earlier or later", () => {
    expect(startOffsetMs("15")).toBe(15 * 60_000);
    expect(startOffsetMs("-10")).toBe(-10 * 60_000);
    expect(startOffsetMs(" +5 ")).toBe(5 * 60_000);
    expect(startOffsetMs("2.5")).toBe(150_000);
  });

  it("is zero when blank or not a number", () => {
    expect(startOffsetMs("")).toBe(0);
    expect(startOffsetMs(undefined)).toBe(0);
    expect(startOffsetMs("soon")).toBe(0);
    expect(startOffsetMs("-")).toBe(0);
  });

  it("keeps the offset field through sanitizing and defaults it to blank", () => {
    expect(sanitizeGraphicFields("starting-soon", { title: "Game", subtitle: "Field", offset: "-10", extra: "x" })).toEqual({
      title: "Game",
      subtitle: "Field",
      offset: "-10"
    });
    expect(defaultGraphicFields("starting-soon", { title: "Game", location: "Field" }).offset).toBe("");
  });
});
