import { describe, expect, it } from "vitest";
import { initialsFor } from "@/components/kit/avatar";
import { cycleLabel } from "@/components/kit/format";
import { isTypingTarget, shouldHandleHotkey } from "@/components/kit/hotkeys";
import { shortcutKeys } from "@/components/kit/kbd";
import { visibleMenuEntries, type MenuEntry } from "@/components/kit/menu";
import { autoProgressTone, clampPercent } from "@/components/kit/progress";
import { readRemembered, REMEMBERED_PREFIX, writeRemembered } from "@/components/kit/remembered-state";
import { rovingIndex } from "@/components/kit/roving";
import {
  dueTone,
  formatCount,
  relativeDaysLabel,
  resolveTone,
  statusTagClass,
  toneFromStatusClass
} from "@/components/kit/tone";

describe("kit tones", () => {
  it("resolves aliases to one vocabulary", () => {
    expect(resolveTone("approved")).toBe("success");
    expect(resolveTone("ok")).toBe("success");
    expect(resolveTone("warn")).toBe("warning");
    expect(resolveTone("caution")).toBe("warning");
    expect(resolveTone("error")).toBe("danger");
    expect(resolveTone("review")).toBe("review");
    expect(resolveTone(undefined)).toBe("neutral");
    expect(resolveTone(null)).toBe("neutral");
  });

  it("maps tones to the globals.css tag classes", () => {
    expect(statusTagClass("success")).toBe("status-approved");
    expect(statusTagClass("warn")).toBe("status-warn");
    expect(statusTagClass("danger")).toBe("status-danger");
    expect(statusTagClass("live")).toBe("status-live");
    expect(statusTagClass("info")).toBe("status-review");
    expect(statusTagClass("muted")).toBe("status-muted");
  });

  it("reads tones back from existing status-* classes", () => {
    expect(toneFromStatusClass("status-approved")).toBe("success");
    expect(toneFromStatusClass("status-pill status-warn")).toBe("warning");
    expect(toneFromStatusClass("status-danger")).toBe("danger");
    expect(toneFromStatusClass("status-review")).toBe("review");
    expect(toneFromStatusClass("status-neutral")).toBe("neutral");
    expect(toneFromStatusClass("something-else")).toBe("neutral");
    expect(toneFromStatusClass(undefined)).toBe("neutral");
  });

  it("formats counts with a cap and never negative", () => {
    expect(formatCount(3)).toBe("3");
    expect(formatCount(99)).toBe("99");
    expect(formatCount(100)).toBe("99+");
    expect(formatCount(12, 9)).toBe("9+");
    expect(formatCount(-4)).toBe("0");
    expect(formatCount(Number.NaN)).toBe("0");
    expect(formatCount(2.7)).toBe("2");
  });

  it("words due dates the same everywhere", () => {
    expect(relativeDaysLabel(0)).toBe("Today");
    expect(relativeDaysLabel(3)).toBe("in 3d");
    expect(relativeDaysLabel(-2)).toBe("2d ago");
    expect(dueTone(-1)).toBe("danger");
    expect(dueTone(0)).toBe("warning");
    expect(dueTone(1)).toBe("warning");
    expect(dueTone(5)).toBe("neutral");
  });
});

describe("rovingIndex", () => {
  const none = [false, false, false, false];

  it("moves and wraps with the arrow keys", () => {
    expect(rovingIndex(0, "ArrowRight", none)).toBe(1);
    expect(rovingIndex(3, "ArrowRight", none)).toBe(0);
    expect(rovingIndex(0, "ArrowLeft", none)).toBe(3);
    expect(rovingIndex(1, "ArrowDown", none)).toBe(2);
    expect(rovingIndex(1, "ArrowUp", none)).toBe(0);
  });

  it("skips disabled items and honors Home/End", () => {
    const disabled = [true, false, true, false];
    expect(rovingIndex(1, "ArrowRight", disabled)).toBe(3);
    expect(rovingIndex(3, "ArrowRight", disabled)).toBe(1);
    expect(rovingIndex(3, "Home", disabled)).toBe(1);
    expect(rovingIndex(1, "End", disabled)).toBe(3);
  });

  it("ignores other keys and fully disabled rows", () => {
    expect(rovingIndex(0, "Enter", none)).toBeNull();
    expect(rovingIndex(0, "ArrowRight", [true, true])).toBeNull();
    expect(rovingIndex(0, "ArrowRight", [])).toBeNull();
  });
});

describe("remembered state storage", () => {
  function memoryStorage(seed: Record<string, string> = {}) {
    const data = new Map(Object.entries(seed));
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      }
    };
  }
  const isString = (value: unknown): value is string => typeof value === "string";

  it("round-trips JSON under the shared prefix", () => {
    const storage = memoryStorage();
    writeRemembered(storage, "groups:filter:v1", "needs-you");
    expect(storage.data.get(`${REMEMBERED_PREFIX}groups:filter:v1`)).toBe('"needs-you"');
    expect(readRemembered(storage, "groups:filter:v1", "all", isString)).toBe("needs-you");
  });

  it("falls back when missing, unparsable or invalid", () => {
    const storage = memoryStorage({ [`${REMEMBERED_PREFIX}bad`]: "{not json", [`${REMEMBERED_PREFIX}num`]: "4" });
    expect(readRemembered(storage, "missing", "all")).toBe("all");
    expect(readRemembered(storage, "bad", "all")).toBe("all");
    expect(readRemembered(storage, "num", "all", isString)).toBe("all");
    expect(readRemembered(null, "anything", "all")).toBe("all");
  });

  it("never throws when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      }
    };
    expect(readRemembered(blocked, "key", 1)).toBe(1);
    expect(() => writeRemembered(blocked, "key", 2)).not.toThrow();
  });
});

describe("visibleMenuEntries", () => {
  it("drops hidden items and stray separators", () => {
    const entries: MenuEntry[] = [
      "separator",
      { label: "Copy link" },
      { label: "Move", hidden: true },
      "separator",
      "separator",
      { label: "Cancel", tone: "danger" },
      "separator"
    ];
    expect(visibleMenuEntries(entries)).toEqual([{ label: "Copy link" }, "separator", { label: "Cancel", tone: "danger" }]);
  });

  it("removes a separator whose group became empty", () => {
    const entries: MenuEntry[] = [{ label: "Open" }, "separator", { label: "Delete", hidden: true }];
    expect(visibleMenuEntries(entries)).toEqual([{ label: "Open" }]);
  });
});

describe("small formatters", () => {
  it("builds initials from names or email", () => {
    expect(initialsFor("Abby Lane")).toBe("AL");
    expect(initialsFor("Sage Q. Otto")).toBe("SO");
    expect(initialsFor("Otto")).toBe("OT");
    expect(initialsFor("", "sage@example.edu")).toBe("S");
    expect(initialsFor(null, null)).toBe("?");
  });

  it("names cycles with two digits and an optional focus", () => {
    expect(cycleLabel(3)).toBe("Cycle 03");
    expect(cycleLabel(12, " Sports ")).toBe("Cycle 12 · Sports");
    expect(cycleLabel(1, "")).toBe("Cycle 01");
  });

  it("spells shortcuts per platform", () => {
    expect(shortcutKeys("mod+s", true)).toEqual(["⌘", "S"]);
    expect(shortcutKeys("mod+s", false)).toEqual(["Ctrl", "S"]);
    expect(shortcutKeys("shift+enter", true)).toEqual(["⇧", "↵"]);
    expect(shortcutKeys("esc", false)).toEqual(["Esc"]);
  });

  it("clamps progress and picks a meter tone", () => {
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(4, 8)).toBe(50);
    expect(clampPercent(null)).toBeNull();
    expect(clampPercent(Number.NaN)).toBeNull();
    expect(clampPercent(3, 0)).toBeNull();
    expect(autoProgressTone(90)).toBe("success");
    expect(autoProgressTone(60)).toBe("warning");
    expect(autoProgressTone(10)).toBe("danger");
    expect(autoProgressTone(null)).toBe("neutral");
  });
});

describe("hotkey guards", () => {
  const base = { metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, isComposing: false };

  it("skips typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("only handles plain, unhandled key presses outside fields", () => {
    const button = { tagName: "BUTTON" } as unknown as EventTarget;
    expect(shouldHandleHotkey({ ...base, target: button })).toBe(true);
    expect(shouldHandleHotkey({ ...base, metaKey: true, target: button })).toBe(false);
    expect(shouldHandleHotkey({ ...base, defaultPrevented: true, target: button })).toBe(false);
    expect(shouldHandleHotkey({ ...base, isComposing: true, target: button })).toBe(false);
    expect(shouldHandleHotkey({ ...base, target: { tagName: "TEXTAREA" } as unknown as EventTarget })).toBe(false);
  });
});
