import { describe, expect, it } from "vitest";
import { listShortcut, readGroupOrder, writeGroupOrder, neighborIds } from "@/src/lib/keyboard-nav";

function key(init: Partial<KeyboardEvent> & { targetTag?: string; editable?: boolean }) {
  const target = { tagName: init.targetTag ?? "BODY", isContentEditable: init.editable ?? false };
  return {
    key: init.key ?? "",
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    target
  } as unknown as KeyboardEvent;
}

describe("listShortcut", () => {
  it("maps J and K to next and previous", () => {
    expect(listShortcut(key({ key: "j" }))).toBe("next");
    expect(listShortcut(key({ key: "K" }))).toBe("previous");
  });

  it("ignores keys typed into fields and modified keys", () => {
    expect(listShortcut(key({ key: "j", targetTag: "INPUT" }))).toBeNull();
    expect(listShortcut(key({ key: "j", targetTag: "TEXTAREA" }))).toBeNull();
    expect(listShortcut(key({ key: "j", editable: true }))).toBeNull();
    expect(listShortcut(key({ key: "j", metaKey: true }))).toBeNull();
    expect(listShortcut(key({ key: "x" }))).toBeNull();
  });
});

describe("neighborIds", () => {
  it("finds the groups before and after, without wrapping", () => {
    expect(neighborIds(["a", "b", "c"], "b")).toEqual({ previous: "a", next: "c" });
    expect(neighborIds(["a", "b", "c"], "a")).toEqual({ previous: null, next: "b" });
    expect(neighborIds(["a", "b", "c"], "c")).toEqual({ previous: "b", next: null });
  });

  it("returns nothing for a group outside the saved order", () => {
    expect(neighborIds(["a", "b"], "z")).toEqual({ previous: null, next: null });
  });
});

describe("group order storage", () => {
  it("round-trips the order and survives bad data", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v)
    };
    writeGroupOrder(storage, ["a", "b"]);
    expect(readGroupOrder(storage)).toEqual(["a", "b"]);
    store.set("groups:order:v1", "{not json");
    expect(readGroupOrder(storage)).toEqual([]);
  });
});
