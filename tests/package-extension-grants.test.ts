import { describe, expect, it } from "vitest";
import {
  approvedExtensionDaysFor,
  calculateLatePenalty,
  clampExtensionDays,
  denialReasonFor,
  effectiveDeadline,
  extensionBadgeLabel,
  extensionDueIn,
  extensionCoversUser,
  extensionRequestAwaitsUser,
  extensionRequestVisibleTo,
  groupWideExtension,
  isExtensionGranted,
  isLatePenaltyOverridePercent,
  isValidExtensionDays,
  memberLatePenaltyMultiplier,
  resolveGrantTerms
} from "@/src/lib/package-extensions";
import { mayDecideExtensionRequest, mayGrantPendingRequest } from "@/src/server/extension-requests";

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

describe("mayGrantPendingRequest", () => {
  const request = {
    status: "PENDING" as const,
    producerGranted: false,
    approvals: [],
    members: [{ userId: "a" }, { userId: "ep-student" }]
  };

  it("lets execs outside the group grant a pending student request", () => {
    expect(mayGrantPendingRequest("EXECUTIVE_PRODUCER", "e2", request)).toBe(true);
    expect(mayGrantPendingRequest("ADVISER", "adv", request)).toBe(true);
    expect(mayGrantPendingRequest("ASSOCIATE_PRODUCER", "ap", request)).toBe(false);
    expect(mayGrantPendingRequest("EXECUTIVE_PRODUCER", "ep-student", request)).toBe(false);
  });

  it("only applies to undecided student requests with no producer votes", () => {
    expect(mayGrantPendingRequest("EXECUTIVE_PRODUCER", "e2", { ...request, status: "APPROVED" })).toBe(false);
    expect(mayGrantPendingRequest("EXECUTIVE_PRODUCER", "e2", { ...request, producerGranted: true })).toBe(false);
    expect(
      mayGrantPendingRequest("EXECUTIVE_PRODUCER", "e2", { ...request, approvals: [{ userId: "e3" }] })
    ).toBe(false);
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

  it("appends the time left when given", () => {
    expect(extensionBadgeLabel(4, "3D")).toBe("4 Day Extension - Due in 3D");
    expect(extensionBadgeLabel(4, null)).toBe("4 Day Extension");
  });
});

describe("extensionDueIn", () => {
  // Final Cut Oct 6 + 4 days closes 11:59 PM PDT Oct 10 (06:59:59.999Z Oct 11).
  const finalCut = new Date("2026-10-06T00:00:00.000Z");

  it("counts whole days left before the extended close", () => {
    expect(extensionDueIn(finalCut, 4, new Date("2026-10-07T07:00:00.000Z"))).toBe("3D");
  });

  it("switches to hours under a day", () => {
    expect(extensionDueIn(finalCut, 4, new Date("2026-10-10T19:30:00.000Z"))).toBe("12H");
    expect(extensionDueIn(finalCut, 4, new Date("2026-10-11T06:30:00.000Z"))).toBe("1H");
  });

  it("is null once closed or with no Final Cut date", () => {
    expect(extensionDueIn(finalCut, 4, new Date("2026-10-11T07:00:00.000Z"))).toBeNull();
    expect(extensionDueIn(null, 4, new Date("2026-10-07T07:00:00.000Z"))).toBeNull();
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

describe("decimal extension days", () => {
  const finalCut = new Date("2026-10-22T00:00:00.000Z");
  const turnedIn = (key: string) => new Date(`${key}T00:00:00.000Z`);

  it("accepts 0.1 to 30 days with one decimal place", () => {
    expect([0.1, 0.5, 1.5, 2.3, 30].every(isValidExtensionDays)).toBe(true);
    expect([0, 1.25, 30.1, -1, Number.NaN].some(isValidExtensionDays)).toBe(false);
  });

  it("clamps typed values into range at one decimal", () => {
    expect(clampExtensionDays(0)).toBe(0.1);
    expect(clampExtensionDays(45)).toBe(30);
    expect(clampExtensionDays(1.26)).toBe(1.3);
  });

  it("judges a 1.5-day extension by the upload time on its closing day", () => {
    // Closes 11:59 AM PDT Oct 24 (36 hours after 11:59 PM Oct 22).
    const deadline = effectiveDeadline(finalCut, 1.5);
    expect(calculateLatePenalty(deadline, turnedIn("2026-10-24"), new Date("2026-10-24T18:00:00Z")).penaltyMultiplier).toBe(0);
    expect(calculateLatePenalty(deadline, turnedIn("2026-10-24"), new Date("2026-10-24T20:00:00Z"))).toEqual({
      penaltyMultiplier: 0.2,
      daysLate: 1,
      blocksSecondRevision: false
    });
    expect(calculateLatePenalty(deadline, turnedIn("2026-10-25")).penaltyMultiplier).toBe(0.2);
  });

  it("keeps a whole-day extension open until 11:59 PM on its last day", () => {
    const deadline = effectiveDeadline(finalCut, 2);
    expect(calculateLatePenalty(deadline, turnedIn("2026-10-24"), new Date("2026-10-25T06:30:00Z")).penaltyMultiplier).toBe(0);
  });
});
