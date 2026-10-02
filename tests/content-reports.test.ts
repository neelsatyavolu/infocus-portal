import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  message: vi.fn(),
  comment: vi.fn(),
  assignments: vi.fn(),
  users: vi.fn(),
  chatAccess: vi.fn(),
  commentAccess: vi.fn(),
  email: vi.fn(),
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  access: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    hubChatMessage: { findUnique: mocks.message },
    packageStageComment: { findUnique: mocks.comment },
    platformRoleAssignment: { findMany: mocks.assignments },
    user: { findMany: mocks.users }
  }
}));
vi.mock("@/src/server/hub-chat", () => ({ requireChatAccess: mocks.chatAccess }));
vi.mock("@/src/server/package-stage-comments", () => ({ requireStageCommentAccess: mocks.commentAccess }));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.email }));
vi.mock("@/src/lib/hosts", () => ({ mainAppOrigin: () => "https://portal.example.edu" }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.access,
  normalizeEmail: (email?: string | null) => email?.trim().toLowerCase() ?? "",
  PACKAGE_ADVISER_EMAIL: "adviser@example.edu"
}));

import { POST } from "@/app/api/hub-chat/report/route";
import { reportContent } from "@/src/server/content-reports";

const reporter = { userId: "abby", name: "Abby", role: null };
const author = { name: "Otto Example", nickname: "Otto", email: "otto@example.edu" };

function post(body: unknown) {
  return POST(new Request("https://portal.example.edu/api/hub-chat/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.message.mockResolvedValue({ chatId: "chat-1", authorId: "otto", body: "a rude   message", author });
  mocks.comment.mockResolvedValue({ rowId: "row-1", stage: "initial-cut", authorId: "otto", body: "rude feedback", author });
  mocks.chatAccess.mockResolvedValue({ chat: { kind: "GROUP", packageRow: { id: "row-1" }, packageRowId: "row-1" } });
  mocks.commentAccess.mockResolvedValue({});
  mocks.assignments.mockResolvedValue([{ email: "ep@example.edu" }, { email: "otto@example.edu" }]);
  mocks.users.mockResolvedValue([{ email: "abby@example.edu" }, { email: "otto@example.edu" }]);
  mocks.email.mockResolvedValue({ sent: 2 });
});

describe("reporting a message", () => {
  it("tells the adviser and executive producers, never the author, with an excerpt and a link", async () => {
    const result = await reportContent(reporter, { kind: "chat", messageId: "m1", reason: "Bullying" });
    expect(mocks.chatAccess).toHaveBeenCalledWith("abby", "chat-1");
    expect(result).toEqual({ reported: true, notified: 2 });
    const mail = mocks.email.mock.calls[0]![0];
    expect(mail.recipients).toEqual(["ep@example.edu", "adviser@example.edu"]);
    expect(mail.paragraphs).toContain("“a rude message”");
    expect(mail.paragraphs).toContain("Reason given: Bullying");
    expect(mail.ctaUrl).toBe("https://portal.example.edu/groups/row-1");
    expect(mail.push.body).toBe("Abby reported a message from Otto.");
  });

  it("links a direct message to the dashboard", async () => {
    mocks.chatAccess.mockResolvedValue({ chat: { kind: "DIRECT", packageRow: null, packageRowId: null } });
    await reportContent(reporter, { kind: "chat", messageId: "m1" });
    expect(mocks.email.mock.calls[0]![0].ctaUrl).toBe("https://portal.example.edu/dashboard");
  });

  it("checks the reporter can see a stage comment, and links to that stage", async () => {
    await reportContent({ ...reporter, role: "ASSOCIATE_PRODUCER" }, { kind: "comment", commentId: "c1" });
    expect(mocks.commentAccess).toHaveBeenCalledWith("row-1", "abby", "ASSOCIATE_PRODUCER");
    expect(mocks.email.mock.calls[0]![0].ctaUrl).toBe("https://portal.example.edu/groups/row-1/initial-cut");
  });

  it("refuses messages the reporter can't see, missing ones, and their own", async () => {
    mocks.chatAccess.mockRejectedValueOnce(new Error("NOT_FOUND"));
    await expect(reportContent(reporter, { kind: "chat", messageId: "m1" })).rejects.toThrow("NOT_FOUND");
    mocks.message.mockResolvedValueOnce(null);
    await expect(reportContent(reporter, { kind: "chat", messageId: "m2" })).rejects.toThrow("NOT_FOUND");
    mocks.message.mockResolvedValueOnce({ chatId: "chat-1", authorId: "abby", body: "mine", author });
    await expect(reportContent(reporter, { kind: "chat", messageId: "m3" })).rejects.toThrow("BAD_REQUEST");
    expect(mocks.email).not.toHaveBeenCalled();
  });
});

describe("POST /api/hub-chat/report", () => {
  beforeEach(() => {
    mocks.requireUserId.mockResolvedValue("reporter-1");
    mocks.syncUserProfile.mockResolvedValue({ name: "Sage Example", nickname: "Sage", email: "sage@example.edu" });
    mocks.access.mockResolvedValue({ role: null });
  });

  it("validates the target", async () => {
    expect((await post({ kind: "chat" })).status).toBe(400);
    expect((await post({ kind: "other", messageId: "m1" })).status).toBe(400);
  });

  it("reports and limits each person to 10 an hour", async () => {
    mocks.requireUserId.mockResolvedValue("reporter-2");
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await post({ kind: "chat", messageId: "m1" })).status).toBe(201);
    }
    expect((await post({ kind: "chat", messageId: "m1" })).status).toBe(429);
  });
});
