import { describe, expect, it } from "vitest";
import {
  approvedExtensionDaysFor,
  denialReasonFor,
  extensionBadgeLabel,
  extensionCoversUser,
  extensionRequestAwaitsUser,
  extensionRequestVisibleTo,
  groupWideExtension,
  isExtensionGranted,
  isLatePenaltyOverridePercent,
  memberLatePenaltyMultiplier,
  resolveGrantTerms
} from "@/src/lib/package-extensions";
import { mayDecideExtensionRequest } from "@/src/server/extension-requests";

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

  it("skips member agreement on producer grants", () => {
    const grant = {
      ...base,
      producerGranted: true,
      consents: [],
      approvals: [{ userId: "e1", approved: true }]
    };
    expect(extensionRequestAwaitsUser(grant, "a")).toBe(false);
    expect(extensionRequestAwaitsUser({ ...grant, viewerMayDecide: true }, "e2")).toBe(true);
    expect(extensionRequestAwaitsUser({ ...grant, viewerMayDecide: true }, "e1")).toBe(false);
  });
});

describe("isExtensionGranted", () => {
  const twoApprovals = [
    { userId: "e1", approved: true },
    { userId: "e2", approved: true }
  ];

  it("needs full group agreement on student requests", () => {
    expect(
      isExtensionGranted({ approvals: twoApprovals, memberUserIds: ["a", "b"], consents: [] })
    ).toBe(false);
  });

  it("needs no agreement on producer grants, only two approvals", () => {
    const grant = { producerGranted: true, memberUserIds: ["a", "b"], consents: [] };
    expect(isExtensionGranted({ ...grant, approvals: twoApprovals })).toBe(true);
    expect(isExtensionGranted({ ...grant, approvals: [twoApprovals[0]] })).toBe(false);
    expect(
      isExtensionGranted({ ...grant, approvals: [twoApprovals[0], { userId: "e2", approved: false }] })
    ).toBe(false);
  });
});

describe("mayDecideExtensionRequest", () => {
  const row = { assignedProducerUserId: "ap", members: [{ userId: "a" }, { userId: "ep-student" }] };

  it("lets only execs outside the group decide producer grants", () => {
    const grant = { ...row, producerGranted: true };
    expect(mayDecideExtensionRequest("EXECUTIVE_PRODUCER", "e2", grant)).toBe(true);
    expect(mayDecideExtensionRequest("ADVISER", "adv", grant)).toBe(true);
    expect(mayDecideExtensionRequest("SUPER_ADMIN", "sa", grant)).toBe(true);
    expect(mayDecideExtensionRequest("ASSOCIATE_PRODUCER", "ap", grant)).toBe(false);
    expect(mayDecideExtensionRequest("EXECUTIVE_PRODUCER", "ep-student", grant)).toBe(false);
  });

  it("keeps the assigned-producer rule for student requests", () => {
    const request = { ...row, producerGranted: false };
    expect(mayDecideExtensionRequest("ASSOCIATE_PRODUCER", "ap", request)).toBe(true);
    expect(mayDecideExtensionRequest("ASSOCIATE_PRODUCER", "other", request)).toBe(false);
  });
});

describe("extensionBadgeLabel", () => {
  it("shows the granted days", () => {
    expect(extensionBadgeLabel(10)).toBe("10 Day Extension");
    expect(extensionBadgeLabel(1)).toBe("1 Day Extension");
  });

  it("falls back to Extension when no days are on record", () => {
    expect(extensionBadgeLabel(0)).toBe("Extension");
    expect(extensionBadgeLabel(undefined)).toBe("Extension");
  });
});

describe("denialReasonFor", () => {
  it("requires a reason to deny", () => {
    expect(() => denialReasonFor(false, undefined)).toThrow("Add a reason for denying this extension.");
    expect(() => denialReasonFor(false, "   ")).toThrow("Add a reason for denying this extension.");
  });

  it("keeps the trimmed reason on a denial", () => {
    expect(denialReasonFor(false, "  No footage yet  ")).toBe("No footage yet");
  });

  it("stores no reason on an approval", () => {
    expect(denialReasonFor(true, "ignored")).toBe("");
    expect(denialReasonFor(true, undefined)).toBe("");
  });
});

describe("extensionRequestVisibleTo", () => {
  it("shows whole-group requests to every member", () => {
    expect(extensionRequestVisibleTo({ grantedUserIds: [] }, "otto")).toBe(true);
  });

  it("hides a partial grant from members it does not cover", () => {
    expect(extensionRequestVisibleTo({ grantedUserIds: ["sage"] }, "sage")).toBe(true);
    expect(extensionRequestVisibleTo({ grantedUserIds: ["sage"] }, "otto")).toBe(false);
  });
});

describe("extensionCoversUser", () => {
  const partial = { requestedDays: 3, grantedDays: 5, grantedUserIds: ["sage"] };

  it("is true only for covered members of a partial grant", () => {
    expect(extensionCoversUser({ extension: true, extensionRequests: [partial] }, "sage")).toBe(true);
    expect(extensionCoversUser({ extension: true, extensionRequests: [partial] }, "otto")).toBe(false);
  });

  it("keeps a legacy flag with no approved requests for everyone", () => {
    expect(extensionCoversUser({ extension: true, extensionRequests: [] }, "otto")).toBe(true);
    expect(extensionCoversUser({ extension: false, extensionRequests: [] }, "otto")).toBe(false);
  });
});

describe("groupWideExtension", () => {
  const partial = { requestedDays: 3, grantedDays: 10, grantedUserIds: ["sage"] };
  const whole = { requestedDays: 3, grantedDays: 4, grantedUserIds: [] };

  it("hides a group whose only extension is a partial grant", () => {
    expect(groupWideExtension({ extension: true, extensionRequests: [partial] })).toEqual({
      extension: false,
      days: 0
    });
  });

  it("counts whole-group grants only", () => {
    expect(groupWideExtension({ extension: true, extensionRequests: [partial, whole] })).toEqual({
      extension: true,
      days: 4
    });
  });

  it("keeps a legacy flag with no approved requests", () => {
    expect(groupWideExtension({ extension: true, extensionRequests: [] })).toEqual({ extension: true, days: 0 });
    expect(groupWideExtension({ extension: false, extensionRequests: [whole] })).toEqual({
      extension: false,
      days: 0
    });
  });
});

describe("memberLatePenaltyMultiplier", () => {
  const late = { penaltyMultiplier: 0.2, daysLate: 3, blocksSecondRevision: false };
  const onTime = { penaltyMultiplier: 0, daysLate: 0, blocksSecondRevision: false };

  it("uses the automatic penalty without an override", () => {
    expect(memberLatePenaltyMultiplier(late, null)).toBe(0.2);
    expect(memberLatePenaltyMultiplier(onTime, undefined)).toBe(0);
  });

  it("replaces it with the exec's override", () => {
    expect(memberLatePenaltyMultiplier(late, 5)).toBe(0.05);
    expect(memberLatePenaltyMultiplier(onTime, 30)).toBe(0.3);
  });
});

describe("isLatePenaltyOverridePercent", () => {
  it("allows only the offered percentages", () => {
    expect([5, 10, 15, 20, 30].every(isLatePenaltyOverridePercent)).toBe(true);
    expect(isLatePenaltyOverridePercent(0)).toBe(false);
    expect(isLatePenaltyOverridePercent(25)).toBe(false);
  });
});
