import { describe, expect, it } from "vitest";
import {
  capacityTone,
  livestreamCreditFraction,
  livestreamPointsFromHours,
  REQUIRED_LIVESTREAM_HOURS,
  semesterBounds,
  semesterForDate,
  upcomingLivestreamsFirst
} from "@/src/lib/livestream";
import { MAX_LIVESTREAM_POINTS } from "@/src/lib/grading";

describe("livestream semester windows", () => {
  it("maps mid-fall to S1", () => {
    const s = semesterForDate(new Date(Date.UTC(2025, 9, 1))); // Oct 1
    expect(s.term).toBe(1);
    expect(s.academicYearStart).toBe(2025);
    expect(s.label).toBe("2025-26 S1");
  });

  it("maps mid-spring to S2", () => {
    const s = semesterForDate(new Date(Date.UTC(2026, 2, 15))); // Mar 15
    expect(s.term).toBe(2);
    expect(s.academicYearStart).toBe(2025);
    expect(s.label).toBe("2025-26 S2");
  });

  it("uses S1 bounds Aug 13 – Dec 18", () => {
    const s = semesterBounds(2025, 1);
    expect(s.start.toISOString().slice(0, 10)).toBe("2025-08-13");
    expect(s.end.toISOString().slice(0, 10)).toBe("2025-12-18");
  });

  it("uses S2 bounds Jan 5 – Jun 3", () => {
    const s = semesterBounds(2025, 2);
    expect(s.start.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(s.end.toISOString().slice(0, 10)).toBe("2026-06-03");
  });

  it("keeps winter break (Jan 1–4) on prior S1", () => {
    const s = semesterForDate(new Date(Date.UTC(2026, 0, 2)));
    expect(s.term).toBe(1);
    expect(s.academicYearStart).toBe(2025);
  });

  it("keeps summer after S2 on prior S2", () => {
    const s = semesterForDate(new Date(Date.UTC(2026, 6, 1))); // Jul 1
    expect(s.term).toBe(2);
    expect(s.academicYearStart).toBe(2025);
  });
});

describe("livestream hour credit", () => {
  it("requires 8 hours for full credit", () => {
    expect(REQUIRED_LIVESTREAM_HOURS).toBe(8);
    expect(livestreamCreditFraction(8)).toBe(1);
    expect(livestreamPointsFromHours(8)).toBe(MAX_LIVESTREAM_POINTS);
  });

  it("scales partially — 4 hours is 50%", () => {
    expect(livestreamCreditFraction(4)).toBe(0.5);
    expect(livestreamPointsFromHours(4)).toBe(MAX_LIVESTREAM_POINTS / 2);
  });

  it("caps above 8 hours", () => {
    expect(livestreamCreditFraction(12)).toBe(1);
    expect(livestreamPointsFromHours(12)).toBe(MAX_LIVESTREAM_POINTS);
  });

  it("treats zero / negative as no credit", () => {
    expect(livestreamPointsFromHours(0)).toBe(0);
    expect(livestreamPointsFromHours(-1)).toBe(0);
  });
});

describe("capacity tone", () => {
  it("marks full, one open, and 2+ open", () => {
    expect(capacityTone(4, 4)).toBe("full");
    expect(capacityTone(3, 4)).toBe("one");
    expect(capacityTone(1, 4)).toBe("open");
  });
});

describe("upcomingLivestreamsFirst", () => {
  it("moves events from earlier days below today and later, keeping date order", () => {
    const now = new Date(2026, 8, 23, 17, 0);
    const events = [
      { id: "sep18", startsAt: new Date(2026, 8, 18, 18, 0).toISOString() },
      { id: "sep22", startsAt: new Date(2026, 8, 22, 17, 30).toISOString() },
      { id: "today-earlier", startsAt: new Date(2026, 8, 23, 9, 0).toISOString() },
      { id: "sep24", startsAt: new Date(2026, 8, 24, 17, 0).toISOString() }
    ];
    expect(upcomingLivestreamsFirst(events, now).map((event) => event.id)).toEqual([
      "today-earlier",
      "sep24",
      "sep18",
      "sep22"
    ]);
  });
});
