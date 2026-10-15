import { describe, expect, it } from "vitest";
import { deadlineSoonTag, needDetail, needUrgency, orderNeeds, type NeedItem } from "@/components/home/executive-needs";
import { deadlineClosesAt } from "@/src/lib/deadlines";

// Thursday, Oct 15, 2026 at noon Pacific (PDT).
const NOW = new Date("2026-10-15T19:00:00.000Z");

function dueOn(dateKey: string) {
  return deadlineClosesAt(new Date(`${dateKey}T00:00:00.000Z`)).toISOString();
}

function item(key: string, fields: Partial<NeedItem> = {}): NeedItem {
  return { key, kind: "group", title: key, need: "Stage 3 sign-off", href: "/groups", dueAt: null, waitingSince: null, ...fields };
}

describe("orderNeeds", () => {
  it("puts overdue first (oldest at top), then due soonest, then longest waiting, then undated", () => {
    const items = [
      item("waiting-1d", { waitingSince: "2026-10-14T19:00:00.000Z" }),
      item("undated"),
      item("due-mon", { dueAt: dueOn("2026-10-19") }),
      item("overdue-1d", { dueAt: dueOn("2026-10-14") }),
      item("waiting-5d", { waitingSince: "2026-10-10T19:00:00.000Z" }),
      item("due-today", { dueAt: dueOn("2026-10-15") }),
      item("overdue-3d", { dueAt: dueOn("2026-10-12") })
    ];
    expect(orderNeeds(items, NOW).map((need) => need.key)).toEqual([
      "overdue-3d",
      "overdue-1d",
      "due-today",
      "due-mon",
      "waiting-5d",
      "waiting-1d",
      "undated"
    ]);
  });

  it("breaks a deadline tie by how long each waited, and never changes the input", () => {
    const due = dueOn("2026-10-16");
    const items = [
      item("newer", { dueAt: due, waitingSince: "2026-10-14T00:00:00.000Z" }),
      item("older", { dueAt: due, waitingSince: "2026-10-12T00:00:00.000Z" })
    ];
    expect(orderNeeds(items, NOW).map((need) => need.key)).toEqual(["older", "newer"]);
    expect(items.map((need) => need.key)).toEqual(["newer", "older"]);
  });
});

describe("needUrgency", () => {
  it("counts overdue days in Pacific calendar days", () => {
    expect(needUrgency(item("a", { dueAt: dueOn("2026-10-13") }), NOW)).toEqual({
      label: "Overdue 2d",
      tone: "danger",
      basis: "due"
    });
  });

  it("says today, tomorrow, the weekday within a week, then the date", () => {
    const label = (dateKey: string) => needUrgency(item("a", { dueAt: dueOn(dateKey) }), NOW);
    expect(label("2026-10-15")).toMatchObject({ label: "Due today", tone: "warning" });
    expect(label("2026-10-16")).toMatchObject({ label: "Due tomorrow", tone: "warning" });
    expect(label("2026-10-19")).toMatchObject({ label: "Due Mon", tone: "warning" });
    expect(label("2026-10-25")).toMatchObject({ label: "Due Oct 25", tone: "neutral" });
  });

  it("shows how long it has waited when nothing is due, and nothing without dates", () => {
    expect(needUrgency(item("a", { waitingSince: "2026-10-12T10:00:00.000Z" }), NOW)).toEqual({
      label: "Waiting 3d",
      tone: "neutral",
      basis: "waiting"
    });
    expect(needUrgency(item("a", { waitingSince: "2026-10-15T14:00:00.000Z" }), NOW)?.label).toBe("Waiting 5h");
    expect(needUrgency(item("a"), NOW)).toBeNull();
  });
});

describe("needDetail", () => {
  it("adds the wait when the tag shows the deadline", () => {
    const due = item("a", { dueAt: dueOn("2026-10-16"), waitingSince: "2026-10-13T19:00:00.000Z" });
    expect(needDetail(due, NOW)).toBe("Stage 3 sign-off · waiting 2d");
    expect(needDetail(item("b", { waitingSince: "2026-10-13T19:00:00.000Z" }), NOW)).toBe("Stage 3 sign-off");
  });
});

describe("deadlineSoonTag", () => {
  it("tags only overdue and today or tomorrow", () => {
    expect(deadlineSoonTag(dueOn("2026-10-14"), NOW)).toMatchObject({ label: "Overdue 1d", tone: "danger" });
    expect(deadlineSoonTag(dueOn("2026-10-16"), NOW)).toMatchObject({ label: "Due tomorrow", tone: "warning" });
    expect(deadlineSoonTag(dueOn("2026-10-19"), NOW)).toBeNull();
    expect(deadlineSoonTag(null, NOW)).toBeNull();
  });
});
