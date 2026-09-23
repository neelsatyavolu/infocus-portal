import { afterEach, describe, expect, it } from "vitest";
import {
  createSubmittedAnnouncementShareToken,
  verifySubmittedAnnouncementShareToken
} from "@/src/lib/announcement-share";

const originalSecret = process.env.APP_AUTH_SECRET;

afterEach(() => {
  process.env.APP_AUTH_SECRET = originalSecret;
});

describe("submitted announcement share tokens", () => {
  it("round-trips a valid invite token", () => {
    process.env.APP_AUTH_SECRET = "test-secret-for-announcement-share";
    const token = createSubmittedAnnouncementShareToken("superadmin@example.edu", Date.parse("2026-09-04T12:00:00.000Z"));
    const parsed = verifySubmittedAnnouncementShareToken(token, Date.parse("2026-09-04T12:00:00.000Z"));
    expect(parsed).toEqual({ invitedBy: "superadmin@example.edu" });
  });

  it("rejects a tampered or expired token", () => {
    process.env.APP_AUTH_SECRET = "test-secret-for-announcement-share";
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const token = createSubmittedAnnouncementShareToken("superadmin@example.edu", now);
    expect(verifySubmittedAnnouncementShareToken(`${token}x`, now)).toBeNull();
    expect(verifySubmittedAnnouncementShareToken(token, now + 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("keeps a 1-year token valid after 30 days", () => {
    process.env.APP_AUTH_SECRET = "test-secret-for-announcement-share";
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    const token = createSubmittedAnnouncementShareToken("superadmin@example.edu", now, "1y");
    expect(verifySubmittedAnnouncementShareToken(token, now + 31 * 24 * 60 * 60 * 1000)).toEqual({
      invitedBy: "superadmin@example.edu"
    });
    expect(verifySubmittedAnnouncementShareToken(token, now + 366 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
