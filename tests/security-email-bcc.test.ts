import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
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
    mocks.send.mockResolvedValue({ data: { id: "email" }, error: null });
  });

  it("keeps co-recipients out of the visible To header, in every batch", async () => {
    const recipients = ["abby@example.edu", "otto@example.edu", ...Array.from({ length: 50 }, (_, i) => `sage${i}@example.edu`)];
    await sendBrandedEmails({ ...content, recipients, idempotencyKey: "announcement/a1" });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const [message] of mocks.send.mock.calls) {
      expect(message.to).toBe("hub@example.edu");
      expect(message).not.toHaveProperty("cc");
      expect(message.bcc.length).toBeGreaterThan(0);
    }
    expect(mocks.send.mock.calls.flatMap(([message]) => message.bcc)).toEqual(recipients);
    expect(mocks.send.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: "announcement/a1/0" },
      { idempotencyKey: "announcement/a1/1" }
    ]);
  });

  it("still addresses a single recipient directly", async () => {
    await sendBrandedEmails({ ...content, recipients: ["abby@example.edu"] });
    expect(mocks.send.mock.calls[0][0].to).toEqual(["abby@example.edu"]);
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty("bcc");
  });
});
