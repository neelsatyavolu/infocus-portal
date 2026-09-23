import { describe, expect, it } from "vitest";
import { isApprovalTransitionAllowed } from "@/src/lib/approval";

describe("Approval transitions", () => {
  it("allows expected status flow", () => {
    expect(isApprovalTransitionAllowed("IN_REVIEW", "NEEDS_CHANGES")).toBe(true);
    expect(isApprovalTransitionAllowed("NEEDS_CHANGES", "APPROVED")).toBe(true);
    expect(isApprovalTransitionAllowed("APPROVED", "NEEDS_CHANGES")).toBe(true);
  });

  it("blocks invalid jumps", () => {
    expect(isApprovalTransitionAllowed("APPROVED", "IN_REVIEW")).toBe(false);
  });

  it("allows AIRED only from APPROVED or AIRED", () => {
    expect(isApprovalTransitionAllowed("APPROVED", "AIRED")).toBe(true);
    expect(isApprovalTransitionAllowed("AIRED", "AIRED")).toBe(true);
    expect(isApprovalTransitionAllowed("IN_REVIEW", "AIRED")).toBe(false);
    expect(isApprovalTransitionAllowed("NEEDS_CHANGES", "AIRED")).toBe(false);
  });

  it("allows AIRED to revert only to NEEDS_CHANGES", () => {
    expect(isApprovalTransitionAllowed("AIRED", "NEEDS_CHANGES")).toBe(true);
    expect(isApprovalTransitionAllowed("AIRED", "APPROVED")).toBe(false);
    expect(isApprovalTransitionAllowed("AIRED", "IN_REVIEW")).toBe(false);
  });
});
