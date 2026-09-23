import { describe, expect, it } from "vitest";
import { PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";
import {
  canReviewParticipationRequest,
  changedParticipationEntries,
  participationApprovalMailRecipients,
  participationItemsChanged,
  participationNeedsApproval,
  splitParticipationChanges
} from "@/src/lib/participation-grade-requests";

describe("changedParticipationEntries", () => {
  it("keeps new scores and skips identical live cells", () => {
    const changed = changedParticipationEntries(
      [
        { userId: "a", dateKey: "2026-08-18", points: 20, notes: "" },
        { userId: "a", dateKey: "2026-08-20", points: 15, notes: "Late" },
        { userId: "b", dateKey: "2026-08-18", points: 20, notes: "" }
      ],
      [
        { userId: "a", dateKey: "2026-08-18", points: 20, notes: "" },
        { userId: "a", dateKey: "2026-08-20", points: 20, notes: "" }
      ]
    );

    expect(changed).toEqual([
      { userId: "a", dateKey: "2026-08-20", points: 15, notes: "Late" },
      { userId: "b", dateKey: "2026-08-18", points: 20, notes: "" }
    ]);
  });

  it("treats a notes-only edit as a change", () => {
    const changed = changedParticipationEntries(
      [{ userId: "a", dateKey: "2026-08-18", points: 20, notes: "Phone out" }],
      [{ userId: "a", dateKey: "2026-08-18", points: 20, notes: "" }]
    );
    expect(changed).toHaveLength(1);
  });

  it("dedupes the same cell to the last write", () => {
    const changed = changedParticipationEntries(
      [
        { userId: "a", dateKey: "2026-08-18", points: 10, notes: "" },
        { userId: "a", dateKey: "2026-08-18", points: 0, notes: "Absent" }
      ],
      []
    );
    expect(changed).toEqual([{ userId: "a", dateKey: "2026-08-18", points: 0, notes: "Absent" }]);
  });
});

describe("splitParticipationChanges", () => {
  it("auto-applies full marks and queues docked scores", () => {
    const split = splitParticipationChanges([
      { userId: "a", dateKey: "2026-08-18", points: 20, maxPoints: 20, notes: "" },
      { userId: "a", dateKey: "2026-08-20", points: 15, maxPoints: 20, notes: "Late" },
      { userId: "b", dateKey: "2026-08-18", points: 0, maxPoints: 20, notes: "Absent" },
      { userId: "c", dateKey: "2026-08-19", points: 0, maxPoints: 0, notes: "" }
    ]);

    expect(split.autoApply.map((entry) => entry.userId)).toEqual(["a", "c"]);
    expect(split.needsApproval.map((entry) => entry.userId)).toEqual(["a", "b"]);
  });

  it("treats a full-mark day as not needing approval", () => {
    expect(participationNeedsApproval(20, 20)).toBe(false);
    expect(participationNeedsApproval(10, 10)).toBe(false);
    expect(participationNeedsApproval(0, 0)).toBe(false);
    expect(participationNeedsApproval(19, 20)).toBe(true);
    expect(participationNeedsApproval(0, 20)).toBe(true);
  });
});

describe("participationItemsChanged", () => {
  it("is false when the pending set is unchanged", () => {
    const items = [{ userId: "a", dateKey: "2026-08-18", points: 10, notes: "x" }];
    expect(participationItemsChanged(items, items)).toBe(false);
  });

  it("is true when points or notes differ", () => {
    expect(
      participationItemsChanged(
        [{ userId: "a", dateKey: "2026-08-18", points: 10, notes: "" }],
        [{ userId: "a", dateKey: "2026-08-18", points: 5, notes: "" }]
      )
    ).toBe(true);
  });
});

describe("canReviewParticipationRequest", () => {
  it("lets another producer approve", () => {
    expect(
      canReviewParticipationRequest({
        reviewerUserId: "ep",
        requesterUserId: "ap",
        reviewerRole: "EXECUTIVE_PRODUCER"
      })
    ).toEqual({ ok: true });
  });

  it("lets the adviser approve another producer's request", () => {
    expect(
      canReviewParticipationRequest({
        reviewerUserId: "adviser",
        requesterUserId: "ep",
        reviewerRole: "ADVISER"
      })
    ).toEqual({ ok: true });
  });

  it("blocks self-approval, including the adviser", () => {
    expect(
      canReviewParticipationRequest({
        reviewerUserId: "ep",
        requesterUserId: "ep",
        reviewerRole: "EXECUTIVE_PRODUCER"
      })
    ).toEqual({ ok: false, reason: "self" });
    expect(
      canReviewParticipationRequest({
        reviewerUserId: "adviser",
        requesterUserId: "adviser",
        reviewerRole: "ADVISER"
      })
    ).toEqual({ ok: false, reason: "self" });
  });

  it("blocks students", () => {
    expect(
      canReviewParticipationRequest({
        reviewerUserId: "stu",
        requesterUserId: "ep",
        reviewerRole: null
      })
    ).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("participationApprovalMailRecipients", () => {
  it("emails the adviser and other execs, and skips the requester", () => {
    const recipients = participationApprovalMailRecipients({
      requesterEmail: "ep1@pausd.org",
      execEmails: ["ep1@pausd.org", "ep2@pausd.org"]
    });

    expect(recipients.sort()).toEqual(
      ["ep2@pausd.org", PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL].sort()
    );
    expect(recipients).not.toContain("ep1@pausd.org");
  });

  it("emails other execs when the adviser submitted the request", () => {
    const recipients = participationApprovalMailRecipients({
      requesterEmail: PACKAGE_ADVISER_EMAIL,
      execEmails: [PACKAGE_ADVISER_EMAIL!, "ep2@pausd.org"]
    });

    expect(recipients).toContain("ep2@pausd.org");
    expect(recipients).toContain(PLATFORM_SUPER_ADMIN_EMAIL);
    expect(recipients).not.toContain(PACKAGE_ADVISER_EMAIL);
  });

  it("still emails the adviser when no exec assignments are stored", () => {
    const recipients = participationApprovalMailRecipients({
      requesterEmail: "ap@pausd.us",
      execEmails: []
    });

    expect(recipients).toContain(PACKAGE_ADVISER_EMAIL);
    expect(recipients).toContain(PLATFORM_SUPER_ADMIN_EMAIL);
    expect(recipients).not.toContain("ap@pausd.us");
  });
});
