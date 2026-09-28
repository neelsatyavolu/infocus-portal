import { describe, expect, it } from "vitest";
import { PACKAGE_TOSS_PLACEHOLDER, fillPackageTosses } from "@/src/lib/teleprompter-package-toss";

const A3 = `PACKAGE

CAM 2
{COANCHOR}
${PACKAGE_TOSS_PLACEHOLDER}

{ROLL PACKAGE}
{HOLD}`;

describe("fillPackageTosses", () => {
  it("leaves the section alone when no packages are queued", () => {
    expect(fillPackageTosses(A3, [])).toBe(A3);
  });

  it("puts the first package's toss in place of the placeholder", () => {
    const next = fillPackageTosses(A3, [{ title: "Airport Day", toss: "InFocus reporters Abby and Otto went there." }]);
    expect(next).toContain("{COANCHOR}\nInFocus reporters Abby and Otto went there.\n\n{ROLL PACKAGE}");
    expect(next).not.toContain(PACKAGE_TOSS_PLACEHOLDER);
  });

  it("adds a second package block read by the other anchor", () => {
    const next = fillPackageTosses(A3, [
      { title: "Airport Day", toss: "First toss." },
      { title: "Robotics", toss: "Second toss." }
    ]);
    expect(next.endsWith("{HOLD}\n\nCAM 2\n{ANCHOR}\nSecond toss.\n\n{ROLL PACKAGE}\n{HOLD}")).toBe(true);
  });

  it("names the package when its toss is missing, then fills it in later", () => {
    const first = fillPackageTosses(A3, [{ title: "Airport Day", toss: "" }]);
    expect(first).toContain("[INSERT PACKAGE TOSS: Airport Day]");
    const later = fillPackageTosses(first, [{ title: "Airport Day", toss: "Now written." }]);
    expect(later).toContain("{COANCHOR}\nNow written.");
    expect(later).not.toContain("[INSERT PACKAGE TOSS");
  });

  it("never overwrites a toss a producer already edited", () => {
    const edited = A3.replace(PACKAGE_TOSS_PLACEHOLDER, "Producer's own words.");
    expect(fillPackageTosses(edited, [{ title: "Airport Day", toss: "Student toss." }])).toBe(edited);
  });
});
