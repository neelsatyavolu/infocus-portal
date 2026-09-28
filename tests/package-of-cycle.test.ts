import { describe, expect, it } from "vitest";
import {
  PACKAGE_OF_CYCLE_MAX,
  certificateFileName,
  packageOfCycleUnanimous,
  packageOfCycleVoteBlocked
} from "@/src/lib/package-of-cycle";
import { normalizeToss, tossError, TOSS_MAX_LENGTH } from "@/src/lib/package-toss";
import { schoolYearLabel } from "@/src/server/package-of-cycle-certificate";

describe("Package of the Cycle", () => {
  it("wins only when every required grader voted", () => {
    expect(packageOfCycleUnanimous(["ep1", "ep2"], ["ep1"])).toBe(false);
    expect(packageOfCycleUnanimous(["ep1", "ep2"], ["ep2", "ep1", "extra"])).toBe(true);
    expect(packageOfCycleUnanimous([], ["ep1"])).toBe(false);
  });

  it("caps winners per cycle but lets a winner keep its votes", () => {
    expect(packageOfCycleVoteBlocked({ hasFinalCut: true, alreadyWon: false, otherWinnersInCycle: 1 })).toBeNull();
    expect(
      packageOfCycleVoteBlocked({ hasFinalCut: true, alreadyWon: false, otherWinnersInCycle: PACKAGE_OF_CYCLE_MAX })
    ).toMatch(/already won/);
    expect(
      packageOfCycleVoteBlocked({ hasFinalCut: true, alreadyWon: true, otherWinnersInCycle: PACKAGE_OF_CYCLE_MAX })
    ).toBeNull();
    expect(packageOfCycleVoteBlocked({ hasFinalCut: false, alreadyWon: false, otherWinnersInCycle: 0 })).toMatch(
      /no Final Cut/
    );
  });

  it("builds a safe certificate file name", () => {
    expect(certificateFileName(2, "Abby O'Neil")).toBe("Package of the Cycle - Cycle 2 - Abby O'Neil.png");
    expect(certificateFileName(1, "<>/")).toBe("Package of the Cycle - Cycle 1 - Member.png");
  });

  it("labels the school year from the award date", () => {
    expect(schoolYearLabel(new Date("2026-10-20T18:00:00Z"))).toBe("2026–27");
    expect(schoolYearLabel(new Date("2027-03-02T18:00:00Z"))).toBe("2026–27");
  });
});

describe("Final Cut toss", () => {
  it("requires a short toss without markup", () => {
    expect(tossError("  ")).toMatch(/Add a toss/);
    expect(tossError("x".repeat(TOSS_MAX_LENGTH + 1))).toMatch(/characters or fewer/);
    expect(tossError("<b>hi</b>")).toMatch(/can't include/);
    expect(tossError("Roll it {HOLD}")).toMatch(/can't include/);
    expect(tossError("[INSERT PACKAGE TOSS]")).toMatch(/can't include/);
    expect(tossError("InFocus reporters Abby and Otto went there to learn more.")).toBeNull();
  });

  it("tidies whitespace", () => {
    expect(normalizeToss("  Hello   there.\n\n\n\nNext.  ")).toBe("Hello there.\n\nNext.");
  });
});
