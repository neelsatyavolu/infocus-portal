import { describe, expect, it } from "vitest";
import {
  countUnreadComments,
  emptyStageCommentUnread,
  isApprovalComment,
  parseApprovalComment,
  unreadCountForStage,
  wrapApprovalComment
} from "@/src/lib/package-stage-comments";

const student = "student-1";
const producer = "producer-1";

describe("countUnreadComments", () => {
  it("counts producer comments the student has not opened", () => {
    const unread = countUnreadComments(
      [
        {
          rowId: "row-a",
          stage: "brainstorming",
          authorId: producer,
          createdAt: new Date("2026-08-14T18:00:00.000Z")
        },
        {
          rowId: "row-a",
          stage: "brainstorming",
          authorId: producer,
          createdAt: new Date("2026-08-14T19:00:00.000Z")
        },
        {
          rowId: "row-a",
          stage: "a-roll",
          authorId: producer,
          createdAt: new Date("2026-08-14T19:30:00.000Z")
        }
      ],
      [{ rowId: "row-a", stage: "brainstorming", lastReadAt: new Date("2026-08-14T18:30:00.000Z") }],
      student
    );

    expect(unread).toEqual({
      brainstorming: 1,
      "a-roll": 1,
      "initial-cut": 0,
      "final-cut": 0
    });
  });

  it("ignores the viewer's own comments and unknown stages", () => {
    const unread = countUnreadComments(
      [
        {
          rowId: "row-a",
          stage: "brainstorming",
          authorId: student,
          createdAt: new Date("2026-08-14T18:00:00.000Z")
        },
        {
          rowId: "row-a",
          stage: "pitching",
          authorId: producer,
          createdAt: new Date("2026-08-14T18:00:00.000Z")
        }
      ],
      [],
      student
    );

    expect(unread).toEqual(emptyStageCommentUnread());
  });

  it("returns the unread count for one stage", () => {
    const comments = [
      {
        rowId: "row-a",
        stage: "initial-cut",
        authorId: producer,
        createdAt: new Date("2026-08-15T12:00:00.000Z")
      }
    ];
    expect(unreadCountForStage(comments, [], student, "initial-cut")).toBe(1);
    expect(unreadCountForStage(comments, [], student, "a-roll")).toBe(0);
    expect(unreadCountForStage(comments, [], student, "pitching")).toBe(0);
  });
});

describe("approval comments", () => {
  it("marks notes left while approving so they are not revision requests", () => {
    expect(wrapApprovalComment("Nice standup")).toBe("[[approved]]\nNice standup");
    expect(parseApprovalComment("[[approved]]\nNice standup")).toEqual({
      fromApproval: true,
      text: "Nice standup"
    });
    expect(isApprovalComment("[[approved]]\nNice standup")).toBe(true);
    expect(isApprovalComment("Need more b-roll")).toBe(false);
  });
});
