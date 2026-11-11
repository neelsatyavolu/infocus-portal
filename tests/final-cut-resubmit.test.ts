import { describe, expect, it } from "vitest";
import { finalCutReopened, mayReopenFinalCut } from "@/src/lib/package-revisions";

describe("finalCutReopened", () => {
  it("is on when an executive reopened a cut that is in", () => {
    expect(finalCutReopened({ hasFinalCut: true, resubmitAllowed: true, secondRevision: false })).toBe(true);
  });

  it("is off without a cut or without the flag", () => {
    expect(finalCutReopened({ hasFinalCut: false, resubmitAllowed: true, secondRevision: false })).toBe(false);
    expect(finalCutReopened({ hasFinalCut: true, resubmitAllowed: false, secondRevision: false })).toBe(false);
  });

  it("leaves the below-75% second revision in charge when that applies", () => {
    expect(finalCutReopened({ hasFinalCut: true, resubmitAllowed: true, secondRevision: true })).toBe(false);
  });
});

describe("mayReopenFinalCut", () => {
  it("allows executive producers, the adviser and super admins", () => {
    expect(mayReopenFinalCut("EXECUTIVE_PRODUCER")).toBe(true);
    expect(mayReopenFinalCut("ADVISER")).toBe(true);
    expect(mayReopenFinalCut("SUPER_ADMIN")).toBe(true);
  });

  it("refuses associate producers and students", () => {
    expect(mayReopenFinalCut("ASSOCIATE_PRODUCER")).toBe(false);
    expect(mayReopenFinalCut(null)).toBe(false);
  });
});
