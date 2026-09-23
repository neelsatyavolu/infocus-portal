import { describe, expect, it } from "vitest";
import {
  aRollDailyNoticeVersionId,
  aRollNeedsChangesMail,
  aRollUploadedMail,
  approvalDecisionMail,
  brainstormBecameReady,
  brainstormReadyMail,
  checkInApprovedMail,
  commentExcerpt,
  commentMail,
  producerStagePath,
  studentStagePath
} from "@/src/lib/package-stage-events";

describe("brainstorm ready transition", () => {
  const doc = "https://docs.google.com/document/d/abc/edit";

  it("fires only when the last missing piece arrives", () => {
    expect(
      brainstormBecameReady({ proofCount: 2, docUrl: doc }, { proofCount: 3, docUrl: doc })
    ).toBe(true);
    expect(
      brainstormBecameReady({ proofCount: 3, docUrl: "" }, { proofCount: 3, docUrl: doc })
    ).toBe(true);
    expect(
      brainstormBecameReady({ proofCount: 3, docUrl: doc }, { proofCount: 3, docUrl: doc })
    ).toBe(false);
    expect(
      brainstormBecameReady({ proofCount: 1, docUrl: "" }, { proofCount: 2, docUrl: doc })
    ).toBe(false);
  });
});

describe("stage notification copy", () => {
  it("routes students and producers to the matching workspace", () => {
    expect(studentStagePath("brainstorming")).toBe("/brainstorming");
    expect(studentStagePath("initial-cut")).toBe("/initial-cut");
    expect(studentStagePath("pitching")).toBe("/dashboard");
    expect(producerStagePath("row_1", "final-cut")).toBe("/groups/row_1/final-cut");
  });

  it("describes brainstorm completion for the assigned producer", () => {
    const mail = brainstormReadyMail({
      cycleNumber: 1,
      topic: "Lee-Patel",
      members: "Alex Lee, Sam Patel"
    });
    expect(mail.subject).toMatch(/brainstorming ready/);
    expect(mail.paragraphs[0]).toMatch(/three proof-of-contact/);
    expect(mail.pushTitle).toBe("Brainstorming ready");
  });

  it("keeps comment excerpts short", () => {
    expect(commentExcerpt("  tighten the standup  ")).toBe("tighten the standup");
    expect(commentExcerpt("x".repeat(200)).length).toBe(180);
    const mail = commentMail({
      cycleNumber: 1,
      topic: "Lee-Patel",
      stage: "a-roll",
      authorName: "Rod",
      excerpt: "Need more b-roll of the quad."
    });
    expect(mail.subject).toMatch(/A-roll\/B-roll/);
    expect(mail.paragraphs[1]).toBe("Need more b-roll of the quad.");
  });

  it("emails students the a-roll feedback as a needs-changes notice", () => {
    const mail = aRollNeedsChangesMail({
      cycleNumber: 1,
      topic: "Lee-Patel",
      authorName: "Rod",
      excerpt: "Need more b-roll of the quad."
    });
    expect(mail.subject).toMatch(/A-roll\/B-roll needs changes/);
    expect(mail.heading).toBe("A-roll/B-roll needs changes");
    expect(mail.paragraphs[1]).toBe("Need more b-roll of the quad.");
    expect(mail.ctaLabel).toBe("Open A-roll/B-roll");
  });

  it("describes A-roll/B-roll for the assigned producer once per Pacific day", () => {
    const mail = aRollUploadedMail({
      cycleNumber: 1,
      topic: "Lee-Patel",
      members: "Alex Lee, Sam Patel"
    });
    expect(mail.subject).toMatch(/A-roll\/B-roll uploaded/);
    expect(mail.paragraphs[0]).toMatch(/A-roll\/B-roll footage/);
    expect(aRollDailyNoticeVersionId(new Date("2026-08-24T18:00:00.000Z"))).toBe("a-roll:2026-08-24");
    expect(aRollDailyNoticeVersionId(new Date("2026-08-25T06:59:00.000Z"))).toBe("a-roll:2026-08-24");
    expect(aRollDailyNoticeVersionId(new Date("2026-08-25T07:00:00.000Z"))).toBe("a-roll:2026-08-25");
  });

  it("covers approval chain student notices", () => {
    expect(approvalDecisionMail({ cycleNumber: 1, topic: "Lee-Patel", kind: "stage-1", reviewerName: "AP" }).heading).toBe(
      "Stage 1 approved"
    );
    expect(approvalDecisionMail({ cycleNumber: 1, topic: "Lee-Patel", kind: "stage-2", reviewerName: "Adviser" }).pushBody).toMatch(
      /Stage 3/
    );
    expect(approvalDecisionMail({ cycleNumber: 1, topic: "Lee-Patel", kind: "approved", reviewerName: "EP" }).ctaLabel).toBe(
      "Open Final Cut"
    );
    expect(approvalDecisionMail({ cycleNumber: 1, topic: "Lee-Patel", kind: "sent-back", reviewerName: "EP" }).subject).toMatch(
      /sent back/
    );
    expect(
      approvalDecisionMail({
        cycleNumber: 1,
        topic: "Lee-Patel",
        kind: "stage-1",
        reviewerName: "AP",
        excerpt: "Tighten the standup."
      }).paragraphs
    ).toContain("Tighten the standup.");
    expect(
      checkInApprovedMail({
        cycleNumber: 1,
        topic: "Lee-Patel",
        stage: "a-roll",
        reviewerName: "Rod",
        excerpt: "Nice b-roll."
      }).paragraphs
    ).toContain("Nice b-roll.");
  });
});
