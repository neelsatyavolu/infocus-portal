import { describe, expect, it } from "vitest";
import {
  buildReviewHref,
  isReviewNoticeText,
  parseReviewNotice,
  reviewNoticeHref,
  wrapReviewNotice
} from "@/src/lib/package-review-notice";

describe("package review notice", () => {
  it("wraps and parses a versioned review target", () => {
    const body = wrapReviewNotice(
      { projectId: "proj_1", mediaId: "media_1", versionId: "ver_2" },
      "Alma submitted a review. Open Review to see comments."
    );
    expect(parseReviewNotice(body)).toEqual({
      projectId: "proj_1",
      mediaId: "media_1",
      versionId: "ver_2",
      text: "Alma submitted a review. Open Review to see comments."
    });
  });

  it("builds a bare review href with the version query", () => {
    expect(buildReviewHref("proj_1", "media_1", "ver_2")).toBe(
      "/projects/proj_1/review/media_1?bare=1&version=ver_2"
    );
    expect(buildReviewHref("proj_1", "media_1")).toBe("/projects/proj_1/review/media_1?bare=1");
  });

  it("uses the closest same-author event for unmarked notices", () => {
    expect(isReviewNoticeText("Rod submitted a review. Open Review to see comments.")).toBe(true);
    expect(
      reviewNoticeHref({
        body: "Rod submitted a review. Open Review to see comments and upload a new version.",
        authorId: "rod",
        createdAt: "2026-08-15T20:59:00.000Z",
        fallback: { projectId: "proj_1", mediaId: "media_1", versionId: "ver_latest" },
        events: [
          {
            mediaVersionId: "ver_1",
            changedById: "alon",
            createdAt: new Date("2026-08-15T20:24:00.000Z")
          },
          {
            mediaVersionId: "ver_2",
            changedById: "rod",
            createdAt: new Date("2026-08-15T20:59:02.000Z")
          }
        ]
      })
    ).toBe("/projects/proj_1/review/media_1?bare=1&version=ver_2");
  });

  it("ignores ordinary producer notes", () => {
    expect(
      reviewNoticeHref({
        body: "Tighten the standup.",
        authorId: "rod",
        createdAt: "2026-08-15T20:59:00.000Z",
        fallback: { projectId: "proj_1", mediaId: "media_1" }
      })
    ).toBeNull();
  });
});
