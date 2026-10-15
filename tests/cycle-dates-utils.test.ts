import { describe, expect, it } from "vitest";
import {
  STAGE_FIELDS,
  clampCycleCount,
  cycleMonth,
  cycleTitle,
  dirtyCycleNumbers,
  earlierThanStage,
  editLayoutFrom,
  editRows,
  formatDateShort,
  hasAnyDate,
  isCycleClosed,
  isDirty,
  mergeDrafts,
  nextStageKey,
  orderCycles,
  parseCycleCount,
  parseDateKey,
  replaceCycle,
  soonestDeadline,
  stageHint,
  withSavedCycle,
  withServerCycles,
  type PackageCycle
} from "@/app/(app)/package-cycles/cycle-dates-utils";

// Local midnight, the same "today" the page uses (startOfToday).
const TODAY = new Date(2026, 9, 15);
const NBSP = " ";

function cycle(cycleNumber: number, dates: Partial<PackageCycle> = {}): PackageCycle {
  return {
    cycleNumber,
    focus: "",
    pitchingDate: null,
    proofOfContactDate: null,
    aRollBRollDate: null,
    initialCutDate: null,
    finalCutDate: null,
    ...dates
  };
}

const CLOSED = cycle(1, {
  pitchingDate: "2026-08-20",
  proofOfContactDate: "2026-09-01",
  aRollBRollDate: "2026-09-10",
  initialCutDate: "2026-09-20",
  finalCutDate: "2026-09-30"
});
const CURRENT = cycle(2, {
  pitchingDate: "2026-10-01",
  proofOfContactDate: "2026-10-08",
  aRollBRollDate: "2026-10-14",
  initialCutDate: "2026-10-18",
  finalCutDate: "2026-10-28"
});
const PLANNED = cycle(3, { pitchingDate: "2026-10-18", finalCutDate: "2026-12-04" });

describe("dates and wording", () => {
  it("parses date keys at local midnight and rejects empty or bad keys", () => {
    expect(parseDateKey("2026-10-16")?.getTime()).toBe(new Date(2026, 9, 16).getTime());
    expect(parseDateKey(null)).toBeNull();
    expect(parseDateKey("")).toBeNull();
    expect(parseDateKey("not-a-date")).toBeNull();
  });

  it("formats short dates without the year this year, and with it otherwise", () => {
    expect(formatDateShort(new Date(2026, 9, 16), TODAY)).toBe(`Fri,${NBSP}Oct${NBSP}16`);
    expect(formatDateShort(new Date(2027, 0, 14), TODAY)).toBe(`Thu,${NBSP}Jan${NBSP}14, 2027`);
  });

  it("words the field hint as Completed, Today, a countdown, or No date", () => {
    expect(stageHint(null, TODAY)).toBe("No date");
    expect(stageHint("2026-10-14", TODAY)).toBe("Wed · Completed");
    expect(stageHint("2026-10-15", TODAY)).toBe("Thu · Today");
    expect(stageHint("2026-10-18", TODAY)).toBe("Sun · in 3d");
  });

  it("names a cycle by its Proof of Contact month, else its Final Cut month", () => {
    expect(cycleMonth(CURRENT)).toBe("October");
    expect(cycleMonth(PLANNED)).toBe("December");
    expect(cycleMonth(cycle(4))).toBeNull();
    expect(cycleTitle(CURRENT)).toBe("Cycle 2 · October");
    expect(cycleTitle(cycle(4))).toBe("Cycle 4");
  });

  it("capitalizes every short stage name the same way", () => {
    expect(STAGE_FIELDS.map((stage) => stage.short)).toEqual(["Pitching", "Proof of Contact", "A/B-roll", "Initial Cut", "Final Cut"]);
  });

  it("knows when any date is set", () => {
    expect(hasAnyDate([cycle(1), cycle(2)])).toBe(false);
    expect(hasAnyDate([cycle(1), PLANNED])).toBe(true);
  });
});

describe("ordering and deadlines", () => {
  it("closes a cycle only after its Final Cut date", () => {
    expect(isCycleClosed(CLOSED, TODAY)).toBe(true);
    expect(isCycleClosed(CURRENT, TODAY)).toBe(false);
    expect(isCycleClosed(cycle(4), TODAY)).toBe(false);
    expect(isCycleClosed(cycle(5, { finalCutDate: "2026-10-15" }), TODAY)).toBe(false);
  });

  it("orders the current cycle, then planned ones, then closed ones", () => {
    const ordered = orderCycles([PLANNED, CLOSED, CURRENT], TODAY);
    expect(ordered.map((entry) => [entry.cycle.cycleNumber, entry.section])).toEqual([
      [2, "current"],
      [3, "upcoming"],
      [1, "closed"]
    ]);
  });

  it("finds a cycle's next stage in stage order, not date order", () => {
    expect(nextStageKey(CURRENT, TODAY)).toBe("initialCutDate");
    const outOfOrder = cycle(4, { aRollBRollDate: "2026-11-01", finalCutDate: "2026-10-20" });
    expect(nextStageKey(outOfOrder, TODAY)).toBe("aRollBRollDate");
    expect(nextStageKey(CLOSED, TODAY)).toBeNull();
  });

  it("picks the soonest date across open cycles; ties go to the lower cycle", () => {
    const soonest = soonestDeadline([PLANNED, CURRENT, CLOSED], TODAY);
    expect(soonest).toMatchObject({ cycleNumber: 2, days: 3 });
    expect(soonest?.stage.key).toBe("initialCutDate");
    expect(soonestDeadline([CLOSED], TODAY)).toBeNull();
    expect(soonestDeadline([cycle(2, { pitchingDate: "2026-10-15" })], TODAY)?.days).toBe(0);
  });

  it("flags a date earlier than the stage before it", () => {
    const outOfOrder = cycle(4, { pitchingDate: "2026-10-20", aRollBRollDate: "2026-10-18" });
    expect(earlierThanStage(outOfOrder, 2)?.key).toBe("pitchingDate");
    expect(earlierThanStage(CURRENT, 3)).toBeNull();
    expect(earlierThanStage(outOfOrder, 1)).toBeNull();
  });
});

describe("drafts", () => {
  it("treats date or focus changes as unsaved, and a missing saved copy as clean", () => {
    expect(isDirty(CURRENT, CURRENT)).toBe(false);
    expect(isDirty({ ...CURRENT, initialCutDate: null }, CURRENT)).toBe(true);
    expect(isDirty({ ...CURRENT, focus: "Sports" }, CURRENT)).toBe(true);
    expect(isDirty(CURRENT, undefined)).toBe(false);
    expect(dirtyCycleNumbers([CLOSED, { ...CURRENT, finalCutDate: "2026-10-30" }], [CLOSED, CURRENT])).toEqual([2]);
  });

  it("keeps unsaved drafts across a reload, replaces clean ones, and follows the cycle count", () => {
    const edited = { ...CURRENT, finalCutDate: "2026-10-30" };
    const fresh = { ...CLOSED, focus: "Updated elsewhere" };
    const merged = mergeDrafts([CLOSED, CURRENT, PLANNED], [CLOSED, edited, PLANNED], [fresh, CURRENT, cycle(4)]);
    expect(merged).toEqual([fresh, edited, cycle(4)]);
  });

  it("starts a schedule with drafts equal to the saved cycles, sorted", () => {
    expect(withServerCycles(null, [PLANNED, CURRENT])).toEqual({ saved: [CURRENT, PLANNED], drafts: [CURRENT, PLANNED] });
  });

  it("takes the server's copy after a save, unless the draft changed again meanwhile", () => {
    const sent = { ...CURRENT, finalCutDate: "2026-10-30" };
    const result = { ...sent, focus: "trimmed" };
    const quiet = withSavedCycle({ saved: [CURRENT], drafts: [sent] }, result, sent);
    expect(quiet).toEqual({ saved: [result], drafts: [result] });

    const newer = { ...sent, initialCutDate: "2026-10-20" };
    const busy = withSavedCycle({ saved: [CURRENT], drafts: [newer] }, result, sent);
    expect(busy).toEqual({ saved: [result], drafts: [newer] });
  });

  it("replaces one cycle without touching the original list", () => {
    const list = [CLOSED, CURRENT];
    const next = replaceCycle(list, { ...CURRENT, focus: "x" });
    expect(next[1].focus).toBe("x");
    expect(list[1].focus).toBe("");
  });
});

describe("edit layout", () => {
  it("fixes the row order when editing starts and keeps it after sections change", () => {
    const layout = editLayoutFrom(orderCycles([CLOSED, CURRENT, PLANNED], TODAY));
    expect(layout).toEqual({ open: [2, 3], closed: [1] });

    // Cycle 3's dates moved into the past (it would now be closed) and cycle 4 was added.
    const drafts = [CLOSED, CURRENT, { ...PLANNED, finalCutDate: "2026-10-01" }, cycle(4)];
    const rows = editRows(layout, drafts);
    expect(rows.open.map((entry) => entry.cycleNumber)).toEqual([2, 3, 4]);
    expect(rows.closed.map((entry) => entry.cycleNumber)).toEqual([1]);
  });

  it("drops cycles that are gone after the count was lowered", () => {
    const rows = editRows({ open: [2, 3], closed: [1] }, [CLOSED, CURRENT]);
    expect(rows.open.map((entry) => entry.cycleNumber)).toEqual([2]);
  });
});

describe("cycle count", () => {
  it("clamps to whole numbers from 1 to 8", () => {
    expect(clampCycleCount(9)).toBe(8);
    expect(clampCycleCount(0)).toBe(1);
    expect(clampCycleCount(-3)).toBe(1);
    expect(clampCycleCount(2.5)).toBe(2);
    expect(clampCycleCount(Number.NaN)).toBe(1);
  });

  it("reads an empty field as no value", () => {
    expect(parseCycleCount("")).toBeNull();
    expect(parseCycleCount("  ")).toBeNull();
    expect(parseCycleCount("4")).toBe(4);
    expect(parseCycleCount("12")).toBe(8);
  });
});
