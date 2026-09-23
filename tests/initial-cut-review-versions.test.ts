import { describe, expect, it } from "vitest";
import { currentCutRevisionStage, versionApprovedInStage, versionsForReviewStage } from "@/src/lib/initial-cut-review-versions";

describe("currentCutRevisionStage", () => {
  const cut = { mediaItemId: "cut", createdAt: "2026-09-22T10:00:00Z" };
  const denial = { mediaItemId: "cut", stage: "ADVISER_REVIEW", approved: false, createdAt: "2026-09-22T11:00:00Z" };

  it("uses the latest decision on the current cut", () => {
    expect(currentCutRevisionStage(cut, [denial])).toBe("ADVISER_REVIEW");
    expect(currentCutRevisionStage(cut, [denial, { ...denial, stage: "ASSOCIATE_REVIEW", createdAt: "2026-09-22T12:00:00Z" }])).toBe("ASSOCIATE_REVIEW");
    expect(currentCutRevisionStage(cut, [{ ...denial, approved: true, createdAt: "2026-09-22T12:00:00Z" }, denial])).toBeNull();
  });

  it("ignores feedback on older versions or another cut, and missing cuts", () => {
    expect(currentCutRevisionStage(cut, [{ ...denial, createdAt: "2026-09-22T09:00:00Z" }])).toBeNull();
    expect(currentCutRevisionStage(cut, [{ ...denial, mediaItemId: "other" }])).toBeNull();
    expect(currentCutRevisionStage(null, [denial])).toBeNull();
    expect(currentCutRevisionStage(cut, [])).toBeNull();
  });
});

describe("versionsForReviewStage", () => {
  const versions = [
    { id: "v1", versionNumber: 1, createdAt: "2026-08-01T10:00:00.000Z" },
    { id: "v2", versionNumber: 2, createdAt: "2026-08-10T10:00:00.000Z" },
    { id: "v3", versionNumber: 3, createdAt: "2026-08-20T10:00:00.000Z" }
  ];

  it("shows every cut in Stage 1 until an AP approval exists", () => {
    expect(versionsForReviewStage(versions, [], 1).map((item) => item.id)).toEqual(["v3", "v2", "v1"]);
  });

  it("Stage 2 starts at the Stage 1 approved cut and includes newer uploads", () => {
    const signoffs = [{ stage: "ASSOCIATE_REVIEW", approved: true, createdAt: "2026-08-10T12:00:00.000Z" }];
    expect(versionsForReviewStage(versions, signoffs, 1).map((item) => item.id)).toEqual(["v2", "v1"]);
    expect(versionsForReviewStage(versions, signoffs, 2).map((item) => item.id)).toEqual(["v3", "v2"]);
    expect(versionsForReviewStage(versions, signoffs, 3)).toEqual([]);
  });

  it("Stage 3 starts at the Stage 2 approved cut", () => {
    const signoffs = [
      { stage: "ASSOCIATE_REVIEW", approved: true, createdAt: "2026-08-10T12:00:00.000Z" },
      { stage: "ADVISER_REVIEW", approved: true, createdAt: "2026-08-20T12:00:00.000Z" }
    ];
    expect(versionsForReviewStage(versions, signoffs, 3).map((item) => item.id)).toEqual(["v3"]);
  });

  it("records the highest stage a version was the current approved cut", () => {
    const signoffs = [
      { stage: "ASSOCIATE_REVIEW", approved: true, createdAt: "2026-08-10T12:00:00.000Z" },
      { stage: "ADVISER_REVIEW", approved: true, createdAt: "2026-08-20T12:00:00.000Z" }
    ];
    expect(versionApprovedInStage("v2", versions, signoffs)).toBe(1);
    expect(versionApprovedInStage("v3", versions, signoffs)).toBe(2);
    expect(versionApprovedInStage("v1", versions, signoffs)).toBeNull();
  });
});
