import { afterEach, describe, expect, it, vi } from "vitest";
import { isCoarsePointer, shouldEnterSend } from "@/src/lib/enter-to-send";

const enter = { key: "Enter", shiftKey: false, isComposing: false };

describe("shouldEnterSend", () => {
  it("sends on plain Enter with a mouse or trackpad", () => {
    expect(shouldEnterSend(enter, false)).toBe(true);
  });

  it("keeps Shift+Enter as a newline", () => {
    expect(shouldEnterSend({ ...enter, shiftKey: true }, false)).toBe(false);
  });

  it("does not send while an IME composition is open", () => {
    expect(shouldEnterSend({ ...enter, isComposing: true }, false)).toBe(false);
  });

  it("ignores other keys", () => {
    expect(shouldEnterSend({ ...enter, key: "a" }, false)).toBe(false);
  });

  it("never sends on a touch keyboard, so Enter can add a newline", () => {
    expect(shouldEnterSend(enter, true)).toBe(false);
  });
});

describe("isCoarsePointer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false when there is no window (server render)", () => {
    expect(isCoarsePointer()).toBe(false);
  });

  it("reads the primary pointer from matchMedia", () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === "(pointer: coarse)" }));
    vi.stubGlobal("window", { matchMedia });
    expect(isCoarsePointer()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("is false for a fine pointer", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(isCoarsePointer()).toBe(false);
  });
});
