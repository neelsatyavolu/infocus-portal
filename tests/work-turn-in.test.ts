import { describe, expect, it } from "vitest";
import { DEFAULT_SCHOOL_YEARS, parseProgramConfig, schoolYearSchema, type SchoolYear } from "@/src/lib/program-config";
import { workTurnInClosedAfter, workTurnInClosedMessage } from "@/src/lib/work-turn-in";

const YEAR: SchoolYear = {
  firstDay: "2026-08-13",
  lastDay: "2027-06-03",
  firstShowDate: "2026-09-04",
  secondSemesterFirstShowDate: "2027-01-08",
  firstSemesterLastWorkDay: "2026-12-13",
  secondSemesterLastWorkDay: "2027-05-30",
  source: "manual"
};

describe("workTurnInClosedAfter", () => {
  it("stays open through 11:59:59 PM Pacific on the first-semester last day", () => {
    // Dec 13 11:59:59 PM PST = Dec 14 07:59:59 UTC.
    expect(workTurnInClosedAfter([YEAR], new Date("2026-12-14T07:59:59.000Z"))).toBeNull();
  });

  it("closes at midnight Pacific after the first-semester last day", () => {
    expect(workTurnInClosedAfter([YEAR], new Date("2026-12-14T08:00:00.000Z"))).toBe("2026-12-13");
    expect(workTurnInClosedAfter([YEAR], new Date("2027-01-07T20:00:00.000Z"))).toBe("2026-12-13");
  });

  it("reopens on the second-semester first show", () => {
    expect(workTurnInClosedAfter([YEAR], new Date("2027-01-08T16:00:00.000Z"))).toBeNull();
  });

  it("closes after the second-semester last day", () => {
    expect(workTurnInClosedAfter([YEAR], new Date("2027-05-30T20:00:00.000Z"))).toBeNull();
    expect(workTurnInClosedAfter([YEAR], new Date("2027-05-31T20:00:00.000Z"))).toBe("2027-05-30");
  });

  it("never closes without a cutoff, or outside a school year", () => {
    const open = { ...YEAR, firstSemesterLastWorkDay: null, secondSemesterLastWorkDay: undefined };
    expect(workTurnInClosedAfter([open], new Date("2026-12-20T20:00:00.000Z"))).toBeNull();
    expect(workTurnInClosedAfter([YEAR], new Date("2027-07-01T20:00:00.000Z"))).toBeNull();
  });

  it("says when turn-in closed", () => {
    expect(workTurnInClosedMessage("2026-12-13")).toBe(
      "Turn-in closed for the semester after Sunday, December 13 at 11:59 PM Pacific."
    );
  });
});

describe("last turn-in day config", () => {
  it("defaults 2026-27 to December 13", () => {
    expect(DEFAULT_SCHOOL_YEARS[0]?.firstSemesterLastWorkDay).toBe("2026-12-13");
  });

  it("fills the default into a year saved before the setting existed, but keeps a cleared one", () => {
    const legacy = {
      firstDay: YEAR.firstDay,
      lastDay: YEAR.lastDay,
      firstShowDate: YEAR.firstShowDate,
      secondSemesterFirstShowDate: YEAR.secondSemesterFirstShowDate
    };
    expect(parseProgramConfig({ schoolYears: [legacy] }).schoolYears[0]?.firstSemesterLastWorkDay).toBe("2026-12-13");
    expect(
      parseProgramConfig({ schoolYears: [{ ...legacy, firstSemesterLastWorkDay: null }] }).schoolYears[0]
        ?.firstSemesterLastWorkDay
    ).toBeNull();
  });

  it("rejects a first-semester cutoff on or after the S2 first show", () => {
    expect(schoolYearSchema.safeParse({ ...YEAR, firstSemesterLastWorkDay: "2027-01-08" }).success).toBe(false);
  });

  it("rejects a second-semester cutoff after the last day of school", () => {
    expect(schoolYearSchema.safeParse({ ...YEAR, secondSemesterLastWorkDay: "2027-06-04" }).success).toBe(false);
  });
});
