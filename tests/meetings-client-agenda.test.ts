import { describe, expect, it } from "vitest";
import {
  agendaProgress,
  cleanAgendaText,
  isSameIdSet,
  moveItem,
  renumber,
  sortAgenda,
  toggleDone,
  withPositions,
  type MeetingAgendaItemView
} from "@/src/lib/meetings/agenda";

const item = (id: string, position: number, done = false): MeetingAgendaItemView => ({
  id,
  text: id,
  position,
  done,
  doneAt: null,
  doneByName: null
});

describe("agenda helpers", () => {
  it("cleans text", () => {
    expect(cleanAgendaText("  a   b ")).toBe("a b");
    expect(cleanAgendaText("   ")).toBeNull();
    expect(cleanAgendaText("x".repeat(301))).toBeNull();
    expect(cleanAgendaText("x".repeat(300))).toHaveLength(300);
  });

  it("renumbers 0..n-1", () => {
    expect(renumber(["c", "a", "b"])).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 }
    ]);
  });

  it("validates reorder sets", () => {
    expect(isSameIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(isSameIdSet(["a", "b"], ["a"])).toBe(false);
    expect(isSameIdSet(["a", "b"], ["a", "a"])).toBe(false);
    expect(isSameIdSet(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("moves optimistically and rewrites positions without mutating", () => {
    const items = [item("a", 0), item("b", 1), item("c", 2)];
    const moved = withPositions(moveItem(items, 0, 2));
    expect(moved.map((i) => [i.id, i.position])).toEqual([["b", 0], ["c", 1], ["a", 2]]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveItem(items, 0, 9).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts, toggles and counts", () => {
    const items = sortAgenda([item("b", 1), item("a", 0, true)]);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    const toggled = toggleDone(items, "b", true, "Abby");
    expect(toggled[1]).toMatchObject({ done: true, doneByName: "Abby" });
    expect(items[1].done).toBe(false);
    expect(agendaProgress(toggled)).toEqual({ done: 2, total: 2, remaining: 0 });
    expect(toggleDone(toggled, "a", false, "Abby")[0]).toMatchObject({ done: false, doneByName: null });
  });
});
