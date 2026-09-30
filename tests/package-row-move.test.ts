import { describe, expect, it } from "vitest";

import { carriedCutFlags } from "@/src/server/package-row-move";

describe("carriedCutFlags", () => {
  it("pins cuts that are already done so the new cycle keeps them", () => {
    expect(
      carriedCutFlags({ initialCut: true, finalCut: true, initialCutManual: false, finalCutManual: false })
    ).toEqual({ initialCutManual: true, finalCutManual: true });
  });

  it("leaves cuts that are not done on automatic", () => {
    expect(
      carriedCutFlags({ initialCut: false, finalCut: false, initialCutManual: false, finalCutManual: false })
    ).toEqual({ initialCutManual: false, finalCutManual: false });
  });

  it("keeps an existing manual flag", () => {
    expect(
      carriedCutFlags({ initialCut: false, finalCut: true, initialCutManual: true, finalCutManual: false })
    ).toEqual({ initialCutManual: true, finalCutManual: true });
  });
});
