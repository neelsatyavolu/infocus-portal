import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendBrandedEmails: vi.fn(),
  requestFindUnique: vi.fn(),
  consentFindMany: vi.fn(),
  roleFindMany: vi.fn()
}));

vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageExtensionRequest: { findUnique: mocks.requestFindUnique },
    packageExtensionMemberConsent: { findMany: mocks.consentFindMany },
    platformRoleAssignment: { findMany: mocks.roleFindMany }
  }
}));

import {
  extensionDeciderEmails,
  notifyGroupOfExtensionRequest,
  notifyProducersOfAgreedExtension
} from "@/src/server/extension-grant-notify";

function member(id: string, email: string | null, notificationEmail: string | null = null) {
  return { user: { id, name: id, nickname: null, email, notificationPreference: { notificationEmail } } };
}

describe("extension request notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("emails the groupmates who still need to agree when a request is filed", async () => {
    mocks.requestFindUnique.mockResolvedValue({
      id: "req",
      cycleNumber: 2,
      requestedDays: 3,
      grantedDays: null,
      producerGranted: false,
      status: "PENDING",
      reason: "Interview moved",
      user: { id: "abby", name: "Abby", nickname: null, email: "abby@example.edu" },
      approvals: [],
      memberConsents: [],
      progressRow: {
        groupTopic: "Robotics",
        members: [
          member("abby", "abby@example.edu"),
          member("otto", "otto@example.edu", "otto.home@example.edu"),
          member("sage", "sage@example.edu"),
          member("gone", null)
        ]
      }
    });
    mocks.consentFindMany.mockResolvedValue([{ userId: "abby" }, { userId: "sage" }]);

    await notifyGroupOfExtensionRequest("req");
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["otto.home@example.edu"]);
    expect(mail.subject).toBe("Abby asked for a 3 days extension for Cycle 2");
    expect(mail.idempotencyKey).toBe("extension-request-created/req");
  });

  it("does not email the group about a producer grant", async () => {
    mocks.requestFindUnique.mockResolvedValue({ status: "PENDING", producerGranted: true });
    expect(await notifyGroupOfExtensionRequest("req")).toBeNull();
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });

  const agreedRequest = (consents: Array<{ userId: string; agreed: boolean }>) => ({
    status: "PENDING",
    producerGranted: false,
    cycleNumber: 2,
    requestedDays: 2,
    reason: "",
    memberConsents: consents,
    progressRow: {
      groupTopic: "Robotics",
      assignedProducer: { email: "ap@example.edu" },
      members: [
        { userId: "abby", user: { email: "abby@example.edu" } },
        { userId: "otto", user: { email: "ep2@example.edu" } }
      ]
    }
  });

  it("emails the producers once every member has agreed", async () => {
    mocks.requestFindUnique.mockResolvedValue(
      agreedRequest([
        { userId: "abby", agreed: true },
        { userId: "otto", agreed: true }
      ])
    );
    mocks.roleFindMany.mockResolvedValue([{ email: "ep1@example.edu" }, { email: "EP2@example.edu" }]);

    await notifyProducersOfAgreedExtension("req");
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    // The assigned producer and execs, minus any exec who is in the group.
    expect(mail.recipients).toEqual(expect.arrayContaining(["ap@example.edu", "ep1@example.edu"]));
    expect(mail.recipients).not.toContain("ep2@example.edu");
    expect(mail.idempotencyKey).toBe("extension-request-agreed/req");
  });

  it("waits while a member still has to agree", async () => {
    mocks.requestFindUnique.mockResolvedValue(agreedRequest([{ userId: "abby", agreed: true }]));
    expect(await notifyProducersOfAgreedExtension("req")).toBeNull();
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });

  it("dedupes decider emails and drops group members", () => {
    expect(
      extensionDeciderEmails({
        execEmails: ["EP1@example.edu", "ep1@example.edu", null],
        assignedProducerEmail: "ap@example.edu",
        memberEmails: ["ap@example.edu"]
      })
    ).toEqual(expect.arrayContaining(["ep1@example.edu"]));
    expect(
      extensionDeciderEmails({ execEmails: [], assignedProducerEmail: "ap@example.edu", memberEmails: ["ap@example.edu"] })
    ).not.toContain("ap@example.edu");
  });
});
