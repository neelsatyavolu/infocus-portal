import { describe, expect, it } from "vitest";
import { relativizeShowDayDates } from "@/src/lib/announcement-relative-dates";

const FRIDAY = "2026-10-30";

describe("relativizeShowDayDates", () => {
  it("turns the show's own date into today", () => {
    expect(
      relativizeShowDayDates("The Teen Arts Council is hosting a Candlelit Concert on October 30th from 7 to 9 p.m.", FRIDAY)
    ).toBe("The Teen Arts Council is hosting a Candlelit Concert today from 7 to 9 p.m.");
  });

  it("turns the next day into tomorrow", () => {
    expect(relativizeShowDayDates("The fair is on Saturday, Oct. 31 at noon.", FRIDAY)).toBe(
      "The fair is tomorrow at noon."
    );
  });

  it("handles numeric dates and explicit years", () => {
    expect(relativizeShowDayDates("Forms are due 10/30.", FRIDAY)).toBe("Forms are due today.");
    expect(relativizeShowDayDates("Forms are due October 30, 2026.", FRIDAY)).toBe("Forms are due today.");
    expect(relativizeShowDayDates("Forms are due October 30, 2025.", FRIDAY)).toBe("Forms are due October 30, 2025.");
  });

  it("capitalizes at the start of a sentence", () => {
    expect(relativizeShowDayDates("On October 30th, the library closes early. October 31st is Halloween.", FRIDAY)).toBe(
      "Today, the library closes early. Tomorrow is Halloween."
    );
  });

  it("leaves other dates and date ranges alone", () => {
    expect(relativizeShowDayDates("Starting Monday, November 2nd, the drive begins.", FRIDAY)).toBe(
      "Starting Monday, November 2nd, the drive begins."
    );
    expect(relativizeShowDayDates("Tryouts are October 30th and 31st.", FRIDAY)).toBe("Tryouts are October 30th and 31st.");
  });

  it("rolls over the year for tomorrow", () => {
    expect(relativizeShowDayDates("The party is on January 1st.", "2026-12-31")).toBe("The party is tomorrow.");
  });
});
