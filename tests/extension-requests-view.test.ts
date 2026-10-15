import { describe, expect, it } from "vitest";
import {
  anyRowPrimary,
  autoOpenId,
  buildRequestView,
  defaultFilter,
  filterCounts,
  hasLiveRequestFor,
  matchesFilter,
  rowPrimary,
  sortViews,
  splitDenied,
  voteHelper,
  type Approval,
  type ExtensionRequest,
  type MemberConsent
} from "@/app/(app)/extension-requests/request-view";

const ABBY = "u-abby";
const OTTO = "u-otto";
const SAGE = "u-sage";
const ROWAN = "u-rowan";
const REMY = "u-remy";

const T1 = "2026-10-01T17:00:00.000Z";
const T2 = "2026-10-02T17:00:00.000Z";
const T3 = "2026-10-03T17:00:00.000Z";
const T4 = "2026-10-04T17:00:00.000Z";

function consent(userId: string, agreed: boolean, createdAt = T1): MemberConsent {
  return { userId, agreed, name: null, createdAt };
}

function vote(userId: string, name: string, approved: boolean, createdAt = T2, reason = ""): Approval {
  return { userId, name, approved, reason, createdAt };
}

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
    memberConsents: [consent(ABBY, true)],
    memberConsentComplete: false,
    canDecide: false,
    canGrantPending: false,
    approvalsRequired: 2,
    approvals: [],
    ...overrides
  };
}

const allAgreed = {
  memberConsents: [consent(ABBY, true), consent(OTTO, true), consent(SAGE, true)],
  memberConsentComplete: true
};

describe("buildRequestView: next step, status and buttons", () => {
  it("asks a teammate who has not agreed for their agreement", () => {
    const view = buildRequestView(request(), OTTO);
    expect(view.needsMyConsent).toBe(true);
    expect(view.awaitsMe).toBe(true);
    expect(view.nextStep).toBe("Needs your agreement");
    expect(view.status).toEqual({ label: "Needs you", tone: "warning" });
    expect(rowPrimary(view)).toBe("agree");
  });

  it("names the members still to agree, two at most", () => {
    expect(buildRequestView(request(), ABBY).nextStep).toBe("Waiting on Otto, Sage");
    const bigger = request({
      groupMembers: [...request().groupMembers, { userId: REMY, name: "Remy", email: null }]
    });
    expect(buildRequestView(bigger, ABBY).nextStep).toBe("Waiting on Otto, Sage +1");
    expect(buildRequestView(request(), ABBY).status).toEqual({ label: "Pending", tone: "neutral" });
  });

  it("keeps Approve disabled with a visible reason until every member agrees", () => {
    const view = buildRequestView(request({ canDecide: true }), ROWAN);
    expect(view.showVote).toBe(true);
    expect(view.approveEnabled).toBe(false);
    expect(view.awaitsMe).toBe(false);
    expect(rowPrimary(view)).toBeNull();
    expect(voteHelper(view)).toBe("Approve unlocks when every member agrees (1/3).");
  });

  it("asks a producer for their vote once the group agrees", () => {
    const view = buildRequestView(request({ ...allAgreed, canDecide: true }), ROWAN);
    expect(view.awaitsMe).toBe(true);
    expect(view.nextStep).toBe("Needs your vote · 0/2");
    expect(rowPrimary(view)).toBe("approve");
    expect(buildRequestView(request({ ...allAgreed }), ABBY).nextStep).toBe("Waiting on producers · 0/2");
  });

  it("waits on a second producer after the first approval, with no primary for the first", () => {
    const entry = request({ ...allAgreed, canDecide: true, approvals: [vote(ROWAN, "Rowan", true)] });
    const mine = buildRequestView(entry, ROWAN);
    expect(mine.iApproved).toBe(true);
    expect(mine.awaitsMe).toBe(false);
    expect(mine.nextStep).toBe("Waiting on a second producer · 1/2");
    expect(rowPrimary(mine)).toBeNull();
    expect(voteHelper(mine)).toBe("You approved these terms. Waiting on a second producer.");
    expect(buildRequestView(entry, REMY).nextStep).toBe("Needs your vote · 1/2");
  });

  it("explains the early Grant to an exec outside the group", () => {
    const view = buildRequestView(request({ canDecide: true, canGrantPending: true }), ROWAN);
    expect(view.showGrant).toBe(true);
    expect(view.nextStep).toBe("You can grant · waiting on Otto, Sage");
    expect(voteHelper(view)).toContain("Grant skips the remaining agreements; one more exec approves.");
  });

  it("treats an exec grant as needing only a second exec", () => {
    const grant = request({
      producerGranted: true,
      student: { id: ROWAN, name: "Rowan", email: null },
      grantedDays: 1.5,
      memberConsents: [],
      approvals: [vote(ROWAN, "Rowan", true, T1)]
    });
    expect(buildRequestView(grant, ABBY).nextStep).toBe("Waiting on a second exec · 1/2");
    const second = buildRequestView({ ...grant, canDecide: true }, REMY);
    expect(second.nextStep).toBe("Needs your vote · 1/2");
    expect(second.needsMyConsent).toBe(false);
    expect(second.shownDays).toBe(1.5);
    expect(second.filedByMember).toBe(false);
  });

  it("shows the asked-for days on a student request even after terms are set", () => {
    const view = buildRequestView(
      request({ ...allAgreed, grantedDays: 1.5, approvals: [vote(ROWAN, "Rowan", true)] }),
      ABBY
    );
    expect(view.shownDays).toBe(2);
    expect(view.termsSet).toBe(true);
    expect(view.terms.grantedDays).toBe(1.5);
  });

  it("states the granted terms on an approved request", () => {
    const approved = request({
      ...allAgreed,
      status: "APPROVED",
      grantedDays: 1.5,
      decidedAt: T3,
      approvals: [vote(ROWAN, "Rowan", true, T2), vote(REMY, "Remy", true, T3)]
    });
    const view = buildRequestView(approved, ABBY);
    expect(view.nextStep).toBe("Granted +1.5 days → whole group");
    expect(view.status).toEqual({ label: "Approved", tone: "success" });
    const partial = buildRequestView({ ...approved, grantedDays: 1, grantedUserIds: [ABBY, OTTO] }, ABBY);
    expect(partial.nextStep).toBe("Granted +1 day → Abby, Otto");
  });

  it("says who denied or declined", () => {
    const denied = request({
      ...allAgreed,
      status: "DENIED",
      decidedAt: T3,
      approvals: [vote(ROWAN, "Rowan", false, T3, "Footage is already late")]
    });
    expect(buildRequestView(denied, ABBY).nextStep).toBe("Denied by Rowan");
    expect(buildRequestView(denied, ABBY).status).toEqual({ label: "Denied", tone: "danger" });
    const declined = request({
      status: "DENIED",
      decidedAt: T2,
      memberConsents: [consent(ABBY, true), consent(OTTO, false, T2)]
    });
    expect(buildRequestView(declined, ABBY).nextStep).toBe("Otto declined");
  });
});

describe("buildRequestView: updated since your last visit", () => {
  const approved = request({
    ...allAgreed,
    status: "APPROVED",
    decidedAt: T4,
    approvals: [vote(ROWAN, "Rowan", true, T2), vote(REMY, "Remy", true, T4)]
  });

  it("does not count the deciding vote the viewer cast", () => {
    expect(buildRequestView(approved, REMY).lastActivityAt).toBe(Date.parse(T2));
  });

  it("counts a decision someone else made", () => {
    expect(buildRequestView(approved, ROWAN).lastActivityAt).toBe(Date.parse(T4));
    expect(buildRequestView(approved, ABBY).lastActivityAt).toBe(Date.parse(T4));
  });

  it("does not count the viewer's own decline", () => {
    const declined = request({
      status: "DENIED",
      decidedAt: T3,
      memberConsents: [consent(ABBY, true, T1), consent(OTTO, false, T3)]
    });
    expect(buildRequestView(declined, OTTO).lastActivityAt).toBe(Date.parse(T1));
    expect(buildRequestView(declined, SAGE).lastActivityAt).toBe(Date.parse(T3));
  });

  it("does not count a request the viewer filed", () => {
    expect(buildRequestView(request({ memberConsents: [] }), ABBY).lastActivityAt).toBe(0);
  });
});

describe("queue helpers", () => {
  const needsOtto = buildRequestView(request({ id: "needs", createdAt: T1 }), OTTO);
  const pendingNew = buildRequestView(request({ id: "pending-new", createdAt: T3, memberConsents: [consent(OTTO, true)] }), OTTO);
  const pendingOld = buildRequestView(request({ id: "pending-old", createdAt: T2, memberConsents: [consent(OTTO, true)] }), OTTO);
  const approved = buildRequestView(request({ id: "approved", status: "APPROVED", createdAt: T4 }), OTTO);
  const denied = buildRequestView(request({ id: "denied", status: "DENIED", createdAt: T4 }), OTTO);
  const views = [denied, approved, pendingOld, needsOtto, pendingNew];

  it("sorts waiting-on-me, pending (newest first), approved, then denied", () => {
    expect(sortViews(views).map((view) => view.entry.id)).toEqual([
      "needs",
      "pending-new",
      "pending-old",
      "approved",
      "denied"
    ]);
  });

  it("counts each filter, Needs you being a subset of Pending", () => {
    expect(filterCounts(views)).toEqual({ "needs-you": 1, pending: 3, approved: 1, denied: 1, all: 5 });
    expect(matchesFilter(needsOtto, "pending")).toBe(true);
    expect(matchesFilter(pendingNew, "needs-you")).toBe(false);
  });

  it("starts on Needs you, else a remembered chip that has rows, else All", () => {
    const counts = filterCounts(views);
    expect(defaultFilter(counts, "approved")).toBe("needs-you");
    const none = { ...counts, "needs-you": 0 };
    expect(defaultFilter(none, "approved")).toBe("approved");
    expect(defaultFilter({ ...none, approved: 0 }, "approved")).toBe("all");
    expect(defaultFilter(none, null)).toBe("all");
  });

  it("folds denied requests away only in All", () => {
    const sorted = sortViews(views);
    const all = splitDenied(sorted, "all");
    expect(all.shown.map((view) => view.entry.id)).not.toContain("denied");
    expect(all.denied.map((view) => view.entry.id)).toEqual(["denied"]);
    const deniedChip = splitDenied([denied], "denied");
    expect(deniedChip).toEqual({ shown: [denied], denied: [] });
  });

  it("opens the first row by itself when it waits on the viewer or is the only one", () => {
    expect(autoOpenId(sortViews(views))).toBe("needs");
    expect(autoOpenId([approved])).toBe("approved");
    expect(autoOpenId([pendingNew, approved])).toBeNull();
    expect(autoOpenId([])).toBeNull();
  });

  it("knows when a request carries a filled decision button", () => {
    expect(anyRowPrimary(views)).toBe(true);
    expect(anyRowPrimary([pendingNew, approved, denied])).toBe(false);
  });

  it("finds the viewer's live request for a cycle", () => {
    expect(hasLiveRequestFor(views, 3, ["PENDING"])).toBe(true);
    expect(hasLiveRequestFor(views, 4, ["PENDING"])).toBe(false);
    expect(hasLiveRequestFor(views, null, ["PENDING"])).toBe(false);
    const outsider = [buildRequestView(request(), ROWAN)];
    expect(hasLiveRequestFor(outsider, 3, ["PENDING", "APPROVED"])).toBe(false);
  });
});
