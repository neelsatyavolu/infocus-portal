import { describe, expect, it } from "vitest";
import {
  executivesWhoApproved,
  isReviewStage,
  reviewReminderKey,
  reviewReminderNumber,
  reviewWaitingSince
} from "@/src/lib/package-review-reminders";
import { reviewReminderMail } from "@/src/lib/package-stage-events";

const at = (iso: string) => new Date(iso);

describe("package review reminders", () => {
  it("only covers the three review stages", () => {
    expect(isReviewStage("ASSOCIATE_REVIEW")).toBe(true);
    expect(isReviewStage("EXECUTIVE_REVIEW")).toBe(true);
    expect(isReviewStage("DRAFT")).toBe(false);
    expect(isReviewStage("APPROVED")).toBe(false);
  });

  it("starts the clock at the later of the upload and the previous stage's approval", () => {
    const upload = at("2026-10-01T08:00:00Z");
    const signoffs = [
      { userId: "ap", stage: "ASSOCIATE_REVIEW" as const, approved: true, createdAt: at("2026-10-01T15:00:00Z") },
      { userId: "adv", stage: "ADVISER_REVIEW" as const, approved: false, createdAt: at("2026-10-02T09:00:00Z") }
    ];
    expect(reviewWaitingSince({ stage: "ADVISER_REVIEW", versionCreatedAt: upload, signoffs })).toEqual(
      at("2026-10-01T15:00:00Z")
    );
    expect(reviewWaitingSince({ stage: "ASSOCIATE_REVIEW", versionCreatedAt: upload, signoffs })).toEqual(upload);
    // A newer upload restarts the clock.
    const reupload = at("2026-10-03T10:00:00Z");
    expect(reviewWaitingSince({ stage: "ADVISER_REVIEW", versionCreatedAt: reupload, signoffs })).toEqual(reupload);
  });

  it("is due after 12 hours and again every 12 hours", () => {
    const since = at("2026-10-01T08:00:00Z");
    expect(reviewReminderNumber(since, at("2026-10-01T19:59:00Z"))).toBeNull();
    expect(reviewReminderNumber(since, at("2026-10-01T20:00:00Z"))).toBe(1);
    expect(reviewReminderNumber(since, at("2026-10-02T07:59:00Z"))).toBe(1);
    expect(reviewReminderNumber(since, at("2026-10-02T08:00:00Z"))).toBe(2);
  });

  it("skips executives who already approved this stage", () => {
    const since = at("2026-10-01T08:00:00Z");
    const approved = executivesWhoApproved(
      [
        { userId: "ep1", stage: "EXECUTIVE_REVIEW", approved: true, createdAt: at("2026-10-01T09:00:00Z") },
        { userId: "ep2", stage: "EXECUTIVE_REVIEW", approved: true, createdAt: at("2026-09-30T09:00:00Z") },
        { userId: "ep3", stage: "EXECUTIVE_REVIEW", approved: false, createdAt: at("2026-10-01T09:00:00Z") }
      ],
      since
    );
    expect([...approved]).toEqual(["ep1"]);
  });

  it("makes one dedupe key per window", () => {
    const since = at("2026-10-01T08:00:00Z");
    expect(reviewReminderKey("v1", since, 1)).not.toBe(reviewReminderKey("v1", since, 2));
  });

  it("says how long the package has waited", () => {
    const mail = reviewReminderMail({
      cycleNumber: 2,
      topic: "Airport Day",
      members: "Abby, Otto",
      stageLabel: "executive review",
      hoursWaiting: 24
    });
    expect(mail.subject).toMatch(/^Reminder: Cycle 2 executive review/);
    expect(mail.paragraphs.join(" ")).toMatch(/waiting for executive review for 24 hours/);
    expect(mail.pushTitle).toBe("Review reminder");
  });
});
