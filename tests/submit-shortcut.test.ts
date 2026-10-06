import type { KeyboardEvent } from "react";
import { describe, expect, it } from "vitest";
import { isSubmitShortcut } from "@/components/ui/submit-shortcut";

function keyEvent(init: { key: string; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean }) {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    nativeEvent: { isComposing: init.isComposing ?? false }
  } as unknown as KeyboardEvent<HTMLElement>;
}

describe("isSubmitShortcut", () => {
  it("accepts Cmd+Enter and Ctrl+Enter", () => {
    expect(isSubmitShortcut(keyEvent({ key: "Enter", metaKey: true }))).toBe(true);
    expect(isSubmitShortcut(keyEvent({ key: "Enter", ctrlKey: true }))).toBe(true);
  });

  it("ignores plain Enter so multi-line boxes still get new lines", () => {
    expect(isSubmitShortcut(keyEvent({ key: "Enter" }))).toBe(false);
  });

  it("ignores Enter that commits an IME composition", () => {
    expect(isSubmitShortcut(keyEvent({ key: "Enter", metaKey: true, isComposing: true }))).toBe(false);
  });

  it("ignores other keys with a modifier", () => {
    expect(isSubmitShortcut(keyEvent({ key: "s", metaKey: true }))).toBe(false);
  });
});
