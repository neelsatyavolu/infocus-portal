import { describe, expect, it } from "vitest";
import { withMemberVote, withProducerVote } from "@/app/(app)/extension-requests/request-patch";
import { buildRequestView, type ExtensionRequest, type Payload } from "@/app/(app)/extension-requests/request-view";

const ABBY = "u-abby";
const OTTO = "u-otto";
const SAGE = "u-sage";
const EXEC = "u-exec";
const T1 = "2026-10-01T17:00:00.000Z";
const NOW = "2026-10-05T17:00:00.000Z";

function request(overrides: Partial<ExtensionRequest> = {}): ExtensionRequest {
  return {
    id: "r1",
    cycleNumber: 3,
    requestedDays: 2,
    grantedDays: null,
    grantedUserIds: [],
    producerGranted: false,
    reason: "",
    status: "PENDING",
    createdAt: T1,
    decidedAt: null,
    groupTopic: "Lunch line wait times",
    student: { id: ABBY, name: "Abby", email: null },
    groupMembers: [
      { userId: ABBY, name: "Abby", email: null },
      { userId: OTTO, name: "Otto", email: null },
      { userId: SAGE, name: "Sage", email: null }
    ],
    memberConsents: [
      { userId: ABBY, agreed: true, name: null, createdAt: T1 },
      { userId: OTTO, agreed: true, name: null, createdAt: T1 }
    ],
    memberConsentComplete: false,
    canDecide: true,
    canGrantPending: false,
    approvalsRequired: 2,
    approvals: [],
    ...overrides
  };
}

function payload(me: string, requests: ExtensionRequest[]): Payload {
  return {
    canDecide: true,
    canGrant: true,
    currentUserId: me,
    approvalsRequired: 2,
    activeCycleNumber: 3,
    cycleNumbers: [1, 2, 3],
    requests
  };
}

const other = request({ id: "r2" });

describe("withMemberVote", () => {
  it("records the last member's agreement and completes consent", () => {
    const next = withMemberVote(payload(SAGE, [request(), other]), { requestId: "r1", agreed: true, status: "PENDING", at: NOW });
    const entry = next.requests[0];
    expect(entry.memberConsents.find((consent) => consent.userId === SAGE)).toMatchObject({ agreed: true, createdAt: NOW });
    expect(entry.memberConsentComplete).toBe(true);
    expect(entry.status).toBe("PENDING");
    expect(entry.decidedAt).toBeNull();
    expect(buildRequestView(entry, SAGE).awaitsMe).toBe(false);
    expect(next.requests[1]).toBe(other);
  });

  it("a decline denies the request", () => {
    const next = withMemberVote(payload(OTTO, [request()]), { requestId: "r1", agreed: false, status: "DENIED", at: NOW });
    const entry = next.requests[0];
    expect(entry.status).toBe("DENIED");
    expect(entry.decidedAt).toBe(NOW);
    expect(entry.memberConsents.filter((consent) => consent.userId === OTTO)).toEqual([
      { userId: OTTO, agreed: false, name: null, createdAt: T1 }
    ]);
    expect(entry.memberConsentComplete).toBe(false);
  });

  it("leaves the list it was given unchanged", () => {
    const before = payload(SAGE, [request()]);
    withMemberVote(before, { requestId: "r1", agreed: true, status: "PENDING", at: NOW });
    expect(before.requests[0].memberConsents).toHaveLength(2);
  });
});

describe("withProducerVote", () => {
  const ready = request({
    memberConsents: [
      { userId: ABBY, agreed: true, name: null, createdAt: T1 },
      { userId: OTTO, agreed: true, name: null, createdAt: T1 },
      { userId: SAGE, agreed: true, name: null, createdAt: T1 }
    ],
    memberConsentComplete: true
  });

  it("adds the viewer's approval so the request no longer waits on them", () => {
    expect(buildRequestView(ready, EXEC).awaitsMe).toBe(true);
    const next = withProducerVote(payload(EXEC, [ready]), { requestId: "r1", approved: true, status: "PENDING", at: NOW });
    const entry = next.requests[0];
    expect(entry.approvals).toEqual([{ userId: EXEC, approved: true, reason: "", name: null, createdAt: NOW }]);
    expect(buildRequestView(entry, EXEC).awaitsMe).toBe(false);
  });

  it("a deny keeps the reason and takes the returned status", () => {
    const next = withProducerVote(payload(EXEC, [ready]), {
      requestId: "r1",
      approved: false,
      reason: "Too late in the cycle",
      status: "DENIED",
      at: NOW
    });
    expect(next.requests[0]).toMatchObject({ status: "DENIED", decidedAt: NOW });
    expect(next.requests[0].approvals[0]).toMatchObject({ approved: false, reason: "Too late in the cycle" });
  });

  it("replaces an earlier vote by the viewer and marks a grant without agreement", () => {
    const voted = request({
      approvals: [{ userId: EXEC, approved: false, reason: "No", name: "Exec", createdAt: T1 }]
    });
    const next = withProducerVote(payload(EXEC, [voted]), {
      requestId: "r1",
      approved: true,
      grantWithoutAgreement: true,
      status: "PENDING",
      at: NOW
    });
    expect(next.requests[0].approvals).toEqual([{ userId: EXEC, approved: true, reason: "", name: "Exec", createdAt: NOW }]);
    expect(next.requests[0].producerGranted).toBe(true);
  });
});
