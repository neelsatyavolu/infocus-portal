import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendBrandedEmails: vi.fn(),
  findUnique: vi.fn()
}));

vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: { packageExtensionRequest: { findUnique: mocks.findUnique } }
}));

import { notifyGroupOfExtensionDecision } from "@/src/server/extension-grant-notify";

function member(id: string, email: string, notificationEmail: string | null = null) {
  return {
    user: { id, name: id, nickname: null, email, notificationPreference: { notificationEmail } }
  };
}

function request(overrides: Record<string, unknown>) {
  return {
    id: "req",
    cycleNumber: 2,
    requestedDays: 3,
    grantedDays: null,
    grantedUserIds: [],
    producerGranted: false,
    reason: "Interview moved",
    status: "APPROVED",
    user: { id: "abby", name: "Abby", nickname: null, email: "abby@example.edu" },
    approvals: [],
    memberConsents: [],
    progressRow: {
      groupTopic: "Robotics",
      members: [
        member("abby", "abby@example.edu"),
        member("otto", "otto@example.edu", "otto.personal@example.edu"),
        member("sage", "sage@example.edu")
      ]
    },
    ...overrides
  };
}

describe("notifyGroupOfExtensionDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("sends one approval email to the whole group when it covers everyone", async () => {
    mocks.findUnique.mockResolvedValue(request({}));

    await notifyGroupOfExtensionDecision("req");

    expect(mocks.sendBrandedEmails).toHaveBeenCalledTimes(1);
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual([
      "abby@example.edu",
      "otto.personal@example.edu",
      "sage@example.edu"
    ]);
    expect(mail.heading).toBe("Extension granted");
  });

  it("emails only the covered members of an approved grant", async () => {
    mocks.findUnique.mockResolvedValue(request({ grantedDays: 2, grantedUserIds: ["sage"] }));

    await notifyGroupOfExtensionDecision("req");

    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["sage@example.edu"]);
    expect(mail.subject).toContain("2 days");
  });

  it("emails the whole group with the producer's reason on denial", async () => {
    mocks.findUnique.mockResolvedValue(
      request({
        status: "DENIED",
        approvals: [
          { approved: false, reason: "Too late", user: { name: "Pat", nickname: null, email: "pat@example.edu" } }
        ]
      })
    );

    await notifyGroupOfExtensionDecision("req");

    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toHaveLength(3);
    expect(mail.heading).toBe("Extension denied");
    expect(mail.paragraphs).toContain("Pat denied it: Too late");
  });

  it("emails only the covered members when a partial grant is denied", async () => {
    mocks.findUnique.mockResolvedValue(
      request({
        status: "DENIED",
        grantedUserIds: ["sage"],
        approvals: [
          { approved: false, reason: "Too late", user: { name: "Pat", nickname: null, email: "pat@example.edu" } }
        ]
      })
    );

    await notifyGroupOfExtensionDecision("req");

    expect(mocks.sendBrandedEmails.mock.calls[0][0].recipients).toEqual(["sage@example.edu"]);
  });

  it("says a member declined when no producer denied it", async () => {
    mocks.findUnique.mockResolvedValue(
      request({ status: "DENIED", memberConsents: [{ agreed: true }, { agreed: false }] })
    );

    await notifyGroupOfExtensionDecision("req");

    expect(mocks.sendBrandedEmails.mock.calls[0][0].paragraphs).toContain(
      "A group member declined the request."
    );
  });

  it("sends nothing while the request is pending", async () => {
    mocks.findUnique.mockResolvedValue(request({ status: "PENDING" }));

    expect(await notifyGroupOfExtensionDecision("req")).toBeNull();
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });
});
