import { describe, expect, it } from "vitest";
import { MASTER_CALENDAR_START_MONTH, parseMasterCalendarMonthParam } from "@/src/lib/master-calendar-month";

const FALLBACK = "2026-10";

describe("parseMasterCalendarMonthParam", () => {
  it("accepts a valid month", () => {
    expect(parseMasterCalendarMonthParam("2027-01", FALLBACK)).toBe("2027-01");
    expect(parseMasterCalendarMonthParam("2026-12", FALLBACK)).toBe("2026-12");
  });

  it("falls back when the param is missing or malformed", () => {
    expect(parseMasterCalendarMonthParam(undefined, FALLBACK)).toBe(FALLBACK);
    expect(parseMasterCalendarMonthParam("", FALLBACK)).toBe(FALLBACK);
    expect(parseMasterCalendarMonthParam("2026-13", FALLBACK)).toBe(FALLBACK);
    expect(parseMasterCalendarMonthParam("2026-00", FALLBACK)).toBe(FALLBACK);
    expect(parseMasterCalendarMonthParam("2026-1", FALLBACK)).toBe(FALLBACK);
    expect(parseMasterCalendarMonthParam("2026-11-01", FALLBACK)).toBe(FALLBACK);
    expect(parseMasterCalendarMonthParam("next", FALLBACK)).toBe(FALLBACK);
  });

  it("uses the first value when the param repeats", () => {
    expect(parseMasterCalendarMonthParam(["2027-02", "2027-03"], FALLBACK)).toBe("2027-02");
    expect(parseMasterCalendarMonthParam([], FALLBACK)).toBe(FALLBACK);
  });

  it("clamps months before the calendar starts", () => {
    expect(parseMasterCalendarMonthParam("2025-05", FALLBACK)).toBe(MASTER_CALENDAR_START_MONTH);
    expect(parseMasterCalendarMonthParam(MASTER_CALENDAR_START_MONTH, FALLBACK)).toBe(MASTER_CALENDAR_START_MONTH);
  });
});
