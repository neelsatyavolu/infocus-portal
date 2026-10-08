import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  }
}));

import { sendBrandedEmails } from "@/src/lib/email";

const content = {
  subject: "Subject",
  heading: "Heading",
  paragraphs: ["Body"],
  ctaLabel: "Open",
  ctaUrl: "https://example.edu"
};

describe("sendBrandedEmails", () => {
  beforeAll(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "hub@example.edu";
  });

  beforeEach(() => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email" }, error: null });
  });

  it("sends one email addressed to every recipient", async () => {
    const result = await sendBrandedEmails({
      ...content,
      recipients: ["abby@example.edu", "otto@example.edu", "Abby@example.edu "]
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].to).toEqual(["abby@example.edu", "otto@example.edu"]);
    expect(result).toEqual({ configured: true, sent: 2, failed: 0 });
  });

  it("splits more than 50 recipients across emails", async () => {
    const recipients = Array.from({ length: 51 }, (_, index) => `student${index}@example.edu`);
    mocks.send
      .mockResolvedValueOnce({ data: { id: "a" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "rejected" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendBrandedEmails({ ...content, recipients });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].to).toHaveLength(50);
    expect(mocks.send.mock.calls[1][0].to).toEqual(["student50@example.edu"]);
    expect(result).toEqual({ configured: true, sent: 50, failed: 1 });
  });

  it("passes an idempotency key per batch, and none by default", async () => {
    const recipients = Array.from({ length: 51 }, (_, index) => `student${index}@example.edu`);
    await sendBrandedEmails({ ...content, recipients, idempotencyKey: "meeting-notes/m1/1" });
    expect(mocks.send.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: "meeting-notes/m1/1/0" },
      { idempotencyKey: "meeting-notes/m1/1/1" }
    ]);
    mocks.send.mockClear();
    await sendBrandedEmails({ ...content, recipients: ["abby@example.edu"] });
    expect(mocks.send.mock.calls[0][1]).toBeUndefined();
  });

  it("skips sending when there are no recipients", async () => {
    const result = await sendBrandedEmails({ ...content, recipients: [" "] });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(result).toEqual({ configured: false, sent: 0, failed: 0 });
  });
});
