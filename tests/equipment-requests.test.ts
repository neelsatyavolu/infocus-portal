import { describe, expect, it } from "vitest";
import { canApproveRequest, canDenyRequest, isRequestFulfilled } from "@/src/lib/equipment-requests";

const available = { archivedAt: null, checkedOut: false, onHoldForStudentId: null };
const held = { archivedAt: null, checkedOut: false, onHoldForStudentId: "stu-1" };
const out = { archivedAt: null, checkedOut: true, onHoldForStudentId: null };
const archived = { archivedAt: new Date(), checkedOut: false, onHoldForStudentId: null };

describe("canApproveRequest", () => {
  it("allows when every item is in", () => {
    expect(canApproveRequest({ status: "PENDING", items: [available, available] })).toBe(true);
  });
  it("rejects when any item is out or held", () => {
    expect(canApproveRequest({ status: "PENDING", items: [available, held] })).toBe(false);
    expect(canApproveRequest({ status: "PENDING", items: [out] })).toBe(false);
  });
  it("rejects pending with empty items", () => {
    expect(canApproveRequest({ status: "PENDING", items: [] })).toBe(false);
  });
  it("rejects pending with an archived item", () => {
    expect(canApproveRequest({ status: "PENDING", items: [archived] })).toBe(false);
  });
  it("rejects approved even when items are available", () => {
    expect(canApproveRequest({ status: "APPROVED", items: [available] })).toBe(false);
  });
});

describe("canDenyRequest", () => {
  it("allows pending", () => {
    expect(canDenyRequest({ status: "PENDING", items: [available], anyCheckedOut: false, remainingHolds: 0 })).toBe(true);
  });
  it("allows pending even if an item is already out", () => {
    expect(canDenyRequest({ status: "PENDING", items: [out], anyCheckedOut: true, remainingHolds: 0 })).toBe(true);
  });
  it("allows approved only if nothing is out and holds remain", () => {
    expect(canDenyRequest({ status: "APPROVED", items: [held], anyCheckedOut: false, remainingHolds: 1 })).toBe(true);
  });
  it("rejects if any item already out or derived-fulfilled", () => {
    expect(canDenyRequest({ status: "APPROVED", items: [out], anyCheckedOut: true, remainingHolds: 0 })).toBe(false);
    expect(canDenyRequest({ status: "APPROVED", items: [available], anyCheckedOut: false, remainingHolds: 0 })).toBe(false);
  });
});

describe("isRequestFulfilled", () => {
  it("is approved with no remaining holds", () => {
    expect(isRequestFulfilled({ status: "APPROVED", remainingHolds: 0 })).toBe(true);
    expect(isRequestFulfilled({ status: "APPROVED", remainingHolds: 1 })).toBe(false);
    expect(isRequestFulfilled({ status: "PENDING", remainingHolds: 0 })).toBe(false);
  });
});
