import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), batch: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
    batch = { send: mocks.batch };
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
    mocks.batch.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email" }, error: null });
    mocks.batch.mockResolvedValue({ data: { data: [] }, error: null });
  });

  it("sends one batch with a copy per unique recipient", async () => {
    const result = await sendBrandedEmails({
      ...content,
      recipients: ["abby@example.edu", "otto@example.edu", "Abby@example.edu "]
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.mock.calls[0][0].map((message: { to: string[] }) => message.to)).toEqual([
      ["abby@example.edu"],
      ["otto@example.edu"]
    ]);
    expect(mocks.batch.mock.calls[0][0][0].from).toBe("hub@example.edu");
    expect(result).toEqual({ configured: true, sent: 2, failed: 0 });
  });

  it("splits more than 100 recipients across batch requests", async () => {
    const recipients = Array.from({ length: 101 }, (_, index) => `student${index}@example.edu`);
    mocks.batch
      .mockResolvedValueOnce({ data: { data: [] }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "rejected" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendBrandedEmails({ ...content, recipients });

    expect(mocks.batch).toHaveBeenCalledTimes(2);
    expect(mocks.batch.mock.calls[0][0]).toHaveLength(100);
    expect(mocks.batch.mock.calls[1][0].map((message: { to: string[] }) => message.to)).toEqual([["student100@example.edu"]]);
    expect(result).toEqual({ configured: true, sent: 100, failed: 1 });
  });

  it("passes an idempotency key per batch, and none by default", async () => {
    const recipients = Array.from({ length: 101 }, (_, index) => `student${index}@example.edu`);
    await sendBrandedEmails({ ...content, recipients, idempotencyKey: "meeting-notes/m1/1" });
    expect(mocks.batch.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: "meeting-notes/m1/1/0" },
      { idempotencyKey: "meeting-notes/m1/1/1" }
    ]);
    await sendBrandedEmails({ ...content, recipients: ["abby@example.edu"] });
    expect(mocks.send.mock.calls[0][1]).toBeUndefined();
  });

  it("skips sending when there are no recipients", async () => {
    const result = await sendBrandedEmails({ ...content, recipients: [" "] });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(result).toEqual({ configured: false, sent: 0, failed: 0 });
  });
});
