import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  send: vi.fn(),
  findDevices: vi.fn(),
  deleteDevices: vi.fn(),
  findUsers: vi.fn()
}));

vi.mock("@/src/lib/apns", () => ({ isApnsConfigured: mocks.configured, sendApns: mocks.send }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    nativePushDevice: { findMany: mocks.findDevices, deleteMany: mocks.deleteDevices },
    user: { findMany: mocks.findUsers }
  }
}));

import {
  pushBodyFromParagraphs,
  sendNativePushToEmails,
  sendNativePushToUserIds,
  threadIdForUrl
} from "@/src/lib/native-push";

const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.findDevices.mockResolvedValue([{ token: tokenA, environment: "production" }]);
  mocks.send.mockImplementation(async (devices: { token: string }[]) =>
    devices.map((device) => ({ token: device.token, ok: true, dead: false, status: 200 }))
  );
  mocks.deleteDevices.mockResolvedValue({ count: 0 });
  mocks.findUsers.mockResolvedValue([{ id: "user-1" }]);
});

describe("notification text", () => {
  it("skips a greeting line and trims long text", () => {
    expect(pushBodyFromParagraphs(["Hi Sage,", "Your grade is ready."])).toBe("Your grade is ready.");
    expect(pushBodyFromParagraphs(["Abby submitted a review."])).toBe("Abby submitted a review.");
    const long = pushBodyFromParagraphs(["x ".repeat(200)]);
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith("…")).toBe(true);
  });

  it("groups by the page a notification opens", () => {
    expect(threadIdForUrl("https://portal.example.edu/groups/abc?tab=initial")).toBe("/groups/abc");
    expect(threadIdForUrl("not a url")).toBeUndefined();
    expect(threadIdForUrl(undefined)).toBeUndefined();
  });
});

describe("sendNativePushToUserIds", () => {
  it("sends to each registered Mac of those people", async () => {
    const result = await sendNativePushToUserIds(["user-1", "user-1", ""], {
      title: "Grade published",
      body: "Cycle 2",
      url: "https://portal.example.edu/grades"
    });
    expect(mocks.findDevices).toHaveBeenCalledWith({
      where: { userId: { in: ["user-1"] } },
      select: { token: true, environment: true }
    });
    expect(mocks.send).toHaveBeenCalledWith([{ token: tokenA, environment: "production" }], {
      title: "Grade published",
      body: "Cycle 2",
      url: "https://portal.example.edu/grades",
      threadId: "/grades"
    });
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("does nothing when Apple Push isn't configured or nobody is given", async () => {
    mocks.configured.mockReturnValue(false);
    expect(await sendNativePushToUserIds(["user-1"], { title: "T", body: "B" })).toEqual({ sent: 0, failed: 0 });
    mocks.configured.mockReturnValue(true);
    expect(await sendNativePushToUserIds([], { title: "T", body: "B" })).toEqual({ sent: 0, failed: 0 });
    expect(mocks.findDevices).not.toHaveBeenCalled();
  });

  it("forgets dead tokens and keeps tokens out of failure logs", async () => {
    mocks.findDevices.mockResolvedValue([
      { token: tokenA, environment: "production" },
      { token: tokenB, environment: "production" }
    ]);
    mocks.send.mockResolvedValue([
      { token: tokenA, ok: false, dead: true, status: 410, reason: "Unregistered" },
      { token: tokenB, ok: false, dead: false, status: 500, reason: "InternalServerError" }
    ]);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await sendNativePushToUserIds(["user-1"], { title: "T", body: "B" });
    expect(mocks.deleteDevices).toHaveBeenCalledWith({ where: { token: { in: [tokenA] } } });
    expect(result).toEqual({ sent: 0, failed: 2 });
    expect(JSON.stringify(log.mock.calls)).not.toContain(tokenB);
    log.mockRestore();
  });

  it("never throws", async () => {
    mocks.findDevices.mockRejectedValue(new Error("database down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendNativePushToUserIds(["user-1"], { title: "T", body: "B" })).resolves.toEqual({ sent: 0, failed: 0 });
    log.mockRestore();
  });
});

describe("sendNativePushToEmails", () => {
  it("matches account or notification email, ignoring case, among people with a Mac", async () => {
    await sendNativePushToEmails([" Sage@Example.edu ", "sage@example.edu", "otto@example.edu"], { title: "T", body: "B" });
    expect(mocks.findUsers).toHaveBeenCalledWith({
      where: {
        nativePushDevices: { some: {} },
        OR: [
          { email: { in: ["sage@example.edu", "otto@example.edu"], mode: "insensitive" } },
          { notificationPreference: { notificationEmail: { in: ["sage@example.edu", "otto@example.edu"], mode: "insensitive" } } }
        ]
      },
      select: { id: true }
    });
    expect(mocks.findDevices).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: { in: ["user-1"] } } }));
  });

  it("skips the lookup when there are no recipients", async () => {
    expect(await sendNativePushToEmails(["  "], { title: "T", body: "B" })).toEqual({ sent: 0, failed: 0 });
    expect(mocks.findUsers).not.toHaveBeenCalled();
  });
});
