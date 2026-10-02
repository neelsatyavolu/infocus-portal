import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resendSend: vi.fn(), push: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  }
}));
vi.mock("@/src/lib/native-push", async (original) => ({
  ...(await original<typeof import("@/src/lib/native-push")>()),
  sendNativePushToEmails: mocks.push
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import {
  sendAccessRequestDecisionEmail,
  sendAccountInviteEmail,
  sendBrandedEmails,
  sendMediaProcessedEmail,
  sendPackageEventEmails,
  sendSignInCodeEmail,
  sendTestNotificationEmail
} from "@/src/lib/email";

const base = {
  recipients: ["sage@example.edu"],
  subject: "Your Package Cycle 2 grade is published",
  heading: "Grade published",
  paragraphs: ["Hi Sage,", "Your grade for Package Cycle 2 is now available."],
  ctaLabel: "Open grade viewer",
  ctaUrl: "https://portal.example.edu/grades"
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "portal@example.edu");
  mocks.resendSend.mockResolvedValue({ data: { id: "mail" }, error: null });
  mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("emails also notify the Mac app", () => {
  it("pushes the subject, first non-greeting paragraph and button link to the same people", async () => {
    const result = await sendBrandedEmails(base);
    expect(result).toEqual({ configured: true, sent: 1, failed: 0 });
    expect(mocks.push).toHaveBeenCalledWith(["sage@example.edu"], {
      title: "Your Package Cycle 2 grade is published",
      body: "Your grade for Package Cycle 2 is now available.",
      url: "https://portal.example.edu/grades"
    });
  });

  it("lets a sender override the push text", async () => {
    await sendBrandedEmails({ ...base, push: { title: "Grade", body: "Cycle 2 is out" } });
    expect(mocks.push).toHaveBeenCalledWith(base.recipients, { title: "Grade", body: "Cycle 2 is out", url: base.ctaUrl });
  });

  it("still pushes when email isn't configured, and keeps the email result", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const result = await sendBrandedEmails(base);
    expect(result).toEqual({ configured: false, sent: 0, failed: 0 });
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("uses package push copy for package events", async () => {
    await sendPackageEventEmails({
      ...base,
      pushTitle: "Final Cut ready to grade",
      pushBody: "Otto's package uploaded a Final Cut."
    } as Parameters<typeof sendPackageEventEmails>[0]);
    expect(mocks.push).toHaveBeenCalledWith(base.recipients, {
      title: "Final Cut ready to grade",
      body: "Otto's package uploaded a Final Cut.",
      url: base.ctaUrl
    });
  });

  it("never pushes sign-in codes, invites, access decisions or the test email", async () => {
    await sendSignInCodeEmail("sage@example.edu", "123456");
    await sendAccountInviteEmail({ recipients: ["sage@example.edu"], signInUrl: base.ctaUrl } as Parameters<typeof sendAccountInviteEmail>[0]);
    await sendAccessRequestDecisionEmail({
      recipients: ["sage@example.edu"],
      status: "APPROVED",
      signInUrl: base.ctaUrl
    } as Parameters<typeof sendAccessRequestDecisionEmail>[0]);
    await sendTestNotificationEmail({ recipients: ["sage@example.edu"], settingsUrl: base.ctaUrl });
    expect(mocks.resendSend).toHaveBeenCalledTimes(4);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("pushes the legacy video-uploaded email too", async () => {
    await sendMediaProcessedEmail({
      recipients: ["sage@example.edu"],
      uploaderName: "Abby",
      mediaTitle: "Rough cut",
      projectName: "Cycle 2",
      reviewUrl: "https://portal.example.edu/review/1"
    } as Parameters<typeof sendMediaProcessedEmail>[0]);
    expect(mocks.push).toHaveBeenCalledWith(["sage@example.edu"], {
      title: "New video uploaded: Rough cut",
      body: "Abby uploaded a new video to Cycle 2.",
      url: "https://portal.example.edu/review/1"
    });
  });
});
