import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUsers: vi.fn(), findDevices: vi.fn() }));

vi.mock("@/src/lib/apns", () => ({
  isApnsConfigured: () => true,
  sendApns: vi.fn(async () => []),
  apnsTopic: () => "com.example.mac"
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findUsers },
    nativePushDevice: { findMany: mocks.findDevices, deleteMany: vi.fn() }
  }
}));

import { sendNativePushToEmails } from "@/src/lib/native-push";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUsers.mockResolvedValue([]);
  mocks.findDevices.mockResolvedValue([]);
});

describe("sendNativePushToEmails recipient matching", () => {
  it("never matches on a self-chosen notification email", async () => {
    await sendNativePushToEmails(["adviser@example.edu"], { title: "Content report", body: "B" });
    const where = mocks.findUsers.mock.calls[0][0].where;
    expect(where).toEqual({
      nativePushDevices: { some: {} },
      email: { in: ["adviser@example.edu"], mode: "insensitive" }
    });
    expect(JSON.stringify(where)).not.toContain("notificationEmail");
    expect(where).not.toHaveProperty("OR");
  });
});
