import { describe, expect, it } from "vitest";
import {
  associateReviewClosed,
  unapproveStage,
  type ApprovalState,
  type Actor
} from "@/src/lib/package-approval";

const actor: Actor = { userId: "ap", role: "ASSOCIATE_PRODUCER", ownsCategory: true };
const state: ApprovalState = {
  stage: "ASSOCIATE_REVIEW", controversial: false,
  signoffs: [{ userId: "ap", stage: "ASSOCIATE_REVIEW", approved: true }]
};
describe("unapproveStage", () => {
  it("allows the assigned producer to withdraw their Stage 1 approval", () => {
    expect(unapproveStage(state, actor)).toBe("ASSOCIATE_REVIEW");
  });
  it("locks associates out once the package reaches Stage 2", () => {
    expect(unapproveStage({ ...state, stage: "ADVISER_REVIEW" }, actor)).toBeNull();
    expect(unapproveStage({ ...state, stage: "EXECUTIVE_REVIEW" }, actor)).toBeNull();
    expect(unapproveStage({ ...state, stage: "APPROVED" }, actor)).toBeNull();
  });
  it("still lets an assigned EP withdraw a Stage 1 approval they gave", () => {
    const ep: Actor = { userId: "ep", role: "EXECUTIVE_PRODUCER", ownsCategory: true };
    expect(unapproveStage({
      ...state, stage: "ADVISER_REVIEW",
      signoffs: [{ userId: "ep", stage: "ASSOCIATE_REVIEW", approved: true }]
    }, ep)).toBe("ASSOCIATE_REVIEW");
  });
  it("rejects other producers, package members, and returned packages", () => {
    expect(unapproveStage(state, { ...actor, userId: "other" })).toBeNull();
    expect(unapproveStage(state, { ...actor, ownsCategory: false })).toBeNull();
    expect(unapproveStage(state, { ...actor, isPackageMember: true })).toBeNull();
    expect(unapproveStage({ ...state, stage: "DRAFT" }, actor)).toBeNull();
  });
  it("lets an executive withdraw their own sign-off after final approval", () => {
    expect(unapproveStage({
      ...state, stage: "APPROVED",
      signoffs: [{ userId: "ep", stage: "EXECUTIVE_REVIEW", approved: true }]
    }, { userId: "ep", role: "EXECUTIVE_PRODUCER" })).toBe("EXECUTIVE_REVIEW");
  });
});

describe("associateReviewClosed", () => {
  it("closes review for associates from Stage 2 on", () => {
    expect(associateReviewClosed("ASSOCIATE_PRODUCER", "DRAFT")).toBe(false);
    expect(associateReviewClosed("ASSOCIATE_PRODUCER", "ASSOCIATE_REVIEW")).toBe(false);
    expect(associateReviewClosed("ASSOCIATE_PRODUCER", "ADVISER_REVIEW")).toBe(true);
    expect(associateReviewClosed("ASSOCIATE_PRODUCER", "EXECUTIVE_REVIEW")).toBe(true);
    expect(associateReviewClosed("ASSOCIATE_PRODUCER", "APPROVED")).toBe(true);
  });
  it("never closes review for other roles or packages without a chain", () => {
    expect(associateReviewClosed("EXECUTIVE_PRODUCER", "ADVISER_REVIEW")).toBe(false);
    expect(associateReviewClosed("ADVISER", "EXECUTIVE_REVIEW")).toBe(false);
    expect(associateReviewClosed("ASSOCIATE_PRODUCER", null)).toBe(false);
  });
});
