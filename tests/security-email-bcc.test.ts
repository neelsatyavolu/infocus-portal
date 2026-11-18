import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), batch: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
    batch = { send: mocks.batch };
  }
}));
vi.mock("@/src/lib/native-push", async (original) => ({
  ...(await original<typeof import("@/src/lib/native-push")>()),
  sendNativePushToEmails: vi.fn(async () => ({ sent: 0, failed: 0 }))
}));

import { sendBrandedEmails } from "@/src/lib/email";

const content = { subject: "S", heading: "H", paragraphs: ["Body"], ctaLabel: "Open", ctaUrl: "https://example.edu", push: false as const };

describe("broadcast email recipient privacy", () => {
  beforeAll(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "hub@example.edu";
  });
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.batch.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email" }, error: null });
    mocks.batch.mockResolvedValue({ data: { data: [] }, error: null });
  });

  it("gives each recipient their own copy and never mails the sender address", async () => {
    const recipients = ["abby@example.edu", "otto@example.edu", ...Array.from({ length: 100 }, (_, i) => `sage${i}@example.edu`)];
    await sendBrandedEmails({ ...content, recipients, idempotencyKey: "announcement/a1" });
    expect(mocks.batch).toHaveBeenCalledTimes(2);
    const messages = mocks.batch.mock.calls.flatMap(([batch]) => batch);
    for (const message of messages) {
      expect(message.to).toHaveLength(1);
      expect(message.to).not.toContain("hub@example.edu");
      expect(message).not.toHaveProperty("cc");
      expect(message).not.toHaveProperty("bcc");
    }
    expect(messages.map((message) => message.to[0])).toEqual(recipients);
    expect(mocks.batch.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: "announcement/a1/0" },
      { idempotencyKey: "announcement/a1/1" }
    ]);
  });

  it("still addresses a single recipient directly", async () => {
    await sendBrandedEmails({ ...content, recipients: ["abby@example.edu"] });
    expect(mocks.send.mock.calls[0][0].to).toEqual(["abby@example.edu"]);
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty("bcc");
    expect(mocks.batch).not.toHaveBeenCalled();
  });
});
