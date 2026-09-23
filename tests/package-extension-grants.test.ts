import { describe, expect, it } from "vitest";
import {
  approvedExtensionDaysFor,
  extensionRequestAwaitsUser,
  resolveGrantTerms
} from "@/src/lib/package-extensions";

describe("approvedExtensionDaysFor", () => {
  const legacy = { requestedDays: 3, grantedDays: null, grantedUserIds: [] };

  it("is 0 when the group has no extension flag", () => {
    expect(approvedExtensionDaysFor({ extension: false, extensionRequests: [legacy] }, "a")).toBe(0);
    expect(approvedExtensionDaysFor(null, "a")).toBe(0);
  });

  it("treats a legacy grant as requested days for the whole group", () => {
    expect(approvedExtensionDaysFor({ extension: true, extensionRequests: [legacy] }, "a")).toBe(3);
  });

  it("uses custom granted days", () => {
    const grant = { requestedDays: 5, grantedDays: 2, grantedUserIds: [] };
    expect(approvedExtensionDaysFor({ extension: true, extensionRequests: [grant] }, "a")).toBe(2);
  });

  it("only covers the selected members", () => {
    const row = {
      extension: true,
      extensionRequests: [{ requestedDays: 4, grantedDays: 4, grantedUserIds: ["a"] }]
    };
    expect(approvedExtensionDaysFor(row, "a")).toBe(4);
    expect(approvedExtensionDaysFor(row, "b")).toBe(0);
  });

  it("returns the longest grant for the group when no user is given", () => {
    const row = {
      extension: true,
      extensionRequests: [
        { requestedDays: 4, grantedDays: 2, grantedUserIds: ["a"] },
        { requestedDays: 6, grantedDays: 5, grantedUserIds: ["b"] }
      ]
    };
    expect(approvedExtensionDaysFor(row)).toBe(5);
  });
});

describe("resolveGrantTerms", () => {
  const members = ["a", "b", "c"];

  it("defaults to requested days and the whole group", () => {
    expect(resolveGrantTerms({ requestedDays: 3, memberUserIds: members })).toEqual({
      grantedDays: 3,
      grantedUserIds: []
    });
  });

  it("stores a subset of members", () => {
    expect(
      resolveGrantTerms({ requestedDays: 3, memberUserIds: members, grantedDays: 1, grantedUserIds: ["b", "a", "a"] })
    ).toEqual({ grantedDays: 1, grantedUserIds: ["a", "b"] });
  });

  it("stores every member as the whole group", () => {
    expect(
      resolveGrantTerms({ requestedDays: 3, memberUserIds: members, grantedUserIds: ["c", "b", "a"] })
    ).toEqual({ grantedDays: 3, grantedUserIds: [] });
  });

  it("rejects members outside the group and empty selections", () => {
    expect(() =>
      resolveGrantTerms({ requestedDays: 3, memberUserIds: members, grantedUserIds: ["z"] })
    ).toThrow(/not in this group/);
    expect(() =>
      resolveGrantTerms({ requestedDays: 3, memberUserIds: members, grantedUserIds: [] })
    ).toThrow(/at least one/);
  });
});

describe("extensionRequestAwaitsUser", () => {
  const base = {
    status: "PENDING" as const,
    memberUserIds: ["a", "b"],
    consents: [{ userId: "a", agreed: true }],
    approvals: [] as Array<{ userId: string; approved: boolean }>,
    viewerMayDecide: false
  };

  it("waits on members who have not answered", () => {
    expect(extensionRequestAwaitsUser(base, "b")).toBe(true);
    expect(extensionRequestAwaitsUser(base, "a")).toBe(false);
  });

  it("waits on producers only after full consent and before they vote", () => {
    expect(extensionRequestAwaitsUser({ ...base, viewerMayDecide: true }, "p")).toBe(false);
    const consented = {
      ...base,
      viewerMayDecide: true,
      consents: [
        { userId: "a", agreed: true },
        { userId: "b", agreed: true }
      ]
    };
    expect(extensionRequestAwaitsUser(consented, "p")).toBe(true);
    expect(
      extensionRequestAwaitsUser({ ...consented, approvals: [{ userId: "p", approved: true }] }, "p")
    ).toBe(false);
  });

  it("never waits on decided requests", () => {
    expect(extensionRequestAwaitsUser({ ...base, status: "APPROVED" }, "b")).toBe(false);
  });
});
