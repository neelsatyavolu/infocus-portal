import { describe, expect, it } from "vitest";
import {
  deadlineClosesAt,
  deadlinePassed,
  finalCutClosesAt,
  finalCutDeadlinePassed,
  finalCutTurnInDateKey
} from "@/src/lib/deadlines";
import { effectiveDeadline } from "@/src/lib/package-extensions";

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe("deadlineClosesAt", () => {
  it("closes at 11:59 PM PDT in the fall", () => {
    expect(deadlineClosesAt(day("2026-10-22")).toISOString()).toBe("2026-10-23T06:59:59.999Z");
  });

  it("closes at 11:59 PM PST in the winter", () => {
    expect(deadlineClosesAt(day("2026-12-10")).toISOString()).toBe("2026-12-11T07:59:59.999Z");
  });

  it("handles the DST change days", () => {
    expect(deadlineClosesAt(day("2026-11-01")).toISOString()).toBe("2026-11-02T07:59:59.999Z");
    expect(deadlineClosesAt(day("2027-03-14")).toISOString()).toBe("2027-03-15T06:59:59.999Z");
  });
});

describe("deadlinePassed", () => {
  it("is still open at 5 PM Pacific on the due date", () => {
    expect(deadlinePassed(day("2026-10-22"), new Date("2026-10-23T00:30:00Z"))).toBe(false);
  });

  it("passes after 11:59 PM Pacific", () => {
    expect(deadlinePassed(day("2026-10-22"), new Date("2026-10-23T07:00:00Z"))).toBe(true);
  });

  it("is false without a date", () => {
    expect(deadlinePassed(null, new Date())).toBe(false);
  });
});

describe("cycle 1 Final Cut extension", () => {
  const due = day("2026-09-29");

  it("closes at 2 AM PDT Sep 30", () => {
    expect(finalCutClosesAt(due).toISOString()).toBe("2026-09-30T09:00:00.000Z");
    expect(finalCutDeadlinePassed(due, new Date("2026-09-30T08:59:00Z"))).toBe(false);
    expect(finalCutDeadlinePassed(due, new Date("2026-09-30T09:01:00Z"))).toBe(true);
  });

  it("counts a 1:30 AM upload as turned in on the due date", () => {
    expect(finalCutTurnInDateKey(new Date("2026-09-30T08:30:00Z"), due)).toBe("2026-09-29");
  });

  it("counts a 2:30 AM upload as the next day", () => {
    expect(finalCutTurnInDateKey(new Date("2026-09-30T09:30:00Z"), due)).toBe("2026-09-30");
  });

  it("counts an 11 PM upload on its Pacific day, not the UTC day", () => {
    expect(finalCutTurnInDateKey(new Date("2026-10-23T06:00:00Z"), day("2026-11-05"))).toBe("2026-10-22");
  });
});

describe("fractional extensions", () => {
  it("adds the leftover hours to the 11:59 PM close", () => {
    const extended = effectiveDeadline(day("2026-10-22"), 1.5)!;
    expect(deadlineClosesAt(extended).toISOString()).toBe("2026-10-24T18:59:59.999Z");
    expect(deadlinePassed(extended, new Date("2026-10-24T18:00:00Z"))).toBe(false);
    expect(deadlinePassed(extended, new Date("2026-10-24T19:00:00Z"))).toBe(true);
  });

  it("adds the offset to a Final Cut close override", () => {
    const extended = effectiveDeadline(day("2026-09-29"), 0.5)!;
    expect(finalCutClosesAt(extended).toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });
});
