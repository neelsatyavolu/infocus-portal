import { describe, expect, it } from "vitest";
import { THANK_YOU_PLACEHOLDER, fillThankYouNames, reporterFirstName } from "@/src/lib/teleprompter-thank-you";

const A4 = `BULLETIN

CAM 2
{COANCHOR}
${THANK_YOU_PLACEHOLDER}`;

describe("fillThankYouNames", () => {
  it("leaves the section alone without names", () => {
    expect(fillThankYouNames(A4, [])).toBe(A4);
    expect(fillThankYouNames(A4, ["", "  "])).toBe(A4);
  });

  it("thanks one reporter", () => {
    expect(fillThankYouNames(A4, ["Otto"])).toBe(A4.replace(THANK_YOU_PLACEHOLDER, "Thank you Otto!"));
  });

  it("joins two reporters with and", () => {
    expect(fillThankYouNames(A4, ["Otto", "Abby"])).toContain("{COANCHOR}\nThank you Otto and Abby!");
  });

  it("uses commas and a final and for three or more", () => {
    expect(fillThankYouNames(A4, ["Abby", "Otto", "Sage"])).toContain("Thank you Abby, Otto, and Sage!");
  });

  it("never overwrites a line a producer already wrote", () => {
    const edited = A4.replace(THANK_YOU_PLACEHOLDER, "Thanks to everyone who helped!");
    expect(fillThankYouNames(edited, ["Abby"])).toBe(edited);
  });
});

describe("reporterFirstName", () => {
  it("prefers the nickname's first word, then the name's", () => {
    expect(reporterFirstName({ name: "Abigail Smith", nickname: "Abby" })).toBe("Abby");
    expect(reporterFirstName({ name: "Otto Lee", nickname: null })).toBe("Otto");
    expect(reporterFirstName({ name: null, nickname: "  " })).toBe("");
  });
});
