import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  meeting: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  roleFindMany: vi.fn(),
  userFindMany: vi.fn(),
  webPush: vi.fn(),
  nativePush: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: mocks.meeting,
    platformRoleAssignment: { findMany: mocks.roleFindMany },
    user: { findMany: mocks.userFindMany }
  }
}));
vi.mock("@/src/server/push-notify", () => ({ sendPushToUserIds: mocks.webPush }));
vi.mock("@/src/lib/native-push", () => ({ sendNativePushToUserIds: mocks.nativePush }));

import { runMeetingReminders } from "@/src/server/meetings-notify";

const NOW = new Date("2026-10-05T04:00:00.000Z");
const MIN = 60_000;

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    title: "InFocus Producer Meeting",
    startsAt: new Date(NOW.getTime() + 15 * MIN),
    createdAt: new Date(NOW.getTime() - 24 * 60 * MIN),
    access: "OPEN",
    createdById: null,
    inviteeUserIds: [] as string[],
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
  mocks.meeting.findMany.mockResolvedValue([]);
  mocks.meeting.updateMany.mockResolvedValue({ count: 1 });
  mocks.roleFindMany.mockResolvedValue([{ email: "abby@example.edu" }, { email: "otto@example.edu" }]);
  mocks.userFindMany.mockResolvedValue([
    { id: "u-abby", name: "Abby", nickname: null, email: "abby@example.edu" },
    { id: "u-otto", name: "Otto", nickname: null, email: "otto@example.edu" }
  ]);
  mocks.webPush.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.nativePush.mockResolvedValue({ sent: 1, failed: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runMeetingReminders", () => {
  it("claims the 15-minute reminder and pushes producers with an absolute /meet/<id> link", async () => {
    mocks.meeting.findMany.mockResolvedValueOnce([meeting()]).mockResolvedValueOnce([]);
    await expect(runMeetingReminders(NOW)).resolves.toEqual({ pushed: 1 });

    const query15 = mocks.meeting.findMany.mock.calls[0][0];
    expect(query15.where.reminder15SentAt).toBeNull();
    expect(query15.where.startsAt).toEqual({ gt: new Date(NOW.getTime() + 13 * MIN), lte: new Date(NOW.getTime() + 15 * MIN) });
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({ where: { id: "m1", reminder15SentAt: null }, data: { reminder15SentAt: NOW } });
    const payload = { title: "InFocus Producer Meeting starts in 15 minutes", body: "Tap to open the meeting.", url: "https://portal.example.edu/meet/m1" };
    expect(mocks.webPush).toHaveBeenCalledWith(["u-abby", "u-otto"], payload, "browser");
    expect(mocks.nativePush).toHaveBeenCalledWith(["u-abby", "u-otto"], payload);
  });

  it("sends the 5-minute reminder with 'Join now.'", async () => {
    const soon = meeting({ startsAt: new Date(NOW.getTime() + 5 * MIN) });
    mocks.meeting.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([soon]);
    await runMeetingReminders(NOW);
    expect(mocks.meeting.updateMany).toHaveBeenCalledWith({ where: { id: "m1", reminder5SentAt: null }, data: { reminder5SentAt: NOW } });
    expect(mocks.nativePush.mock.calls[0][1]).toMatchObject({ title: "InFocus Producer Meeting starts in 5 minutes", body: "Join now." });
  });

  it("never pushes twice when another run already claimed it", async () => {
    mocks.meeting.findMany.mockResolvedValueOnce([meeting()]).mockResolvedValueOnce([]);
    mocks.meeting.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(runMeetingReminders(NOW)).resolves.toEqual({ pushed: 0 });
    expect(mocks.webPush).not.toHaveBeenCalled();
  });

  it("skips a meeting created after the reminder time had passed", async () => {
    // Starts in 14 minutes, so its 15-minute mark was a minute ago; created 30 seconds ago.
    const late = meeting({ startsAt: new Date(NOW.getTime() + 14 * MIN), createdAt: new Date(NOW.getTime() - 30_000) });
    mocks.meeting.findMany.mockResolvedValueOnce([late]).mockResolvedValueOnce([]);
    await runMeetingReminders(NOW);
    expect(mocks.meeting.updateMany).not.toHaveBeenCalled();
  });

  it("INVITE_ONLY reminds only the creator and invitees; OPEN with invitees reminds them only", async () => {
    mocks.meeting.findMany
      .mockResolvedValueOnce([
        meeting({ id: "secret", access: "INVITE_ONLY", createdById: "u-sage", inviteeUserIds: ["u-otto"] }),
        meeting({ id: "open-picked", inviteeUserIds: ["u-abby"] })
      ])
      .mockResolvedValueOnce([]);
    await runMeetingReminders(NOW);
    expect(mocks.nativePush.mock.calls.map((call) => call[0])).toEqual([["u-sage", "u-otto"], ["u-abby"]]);
  });
});
