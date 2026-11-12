import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  roleFindMany: vi.fn(),
  entryFindUnique: vi.fn(),
  sendBrandedEmails: vi.fn(),
  loadScheduleOverrides: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    platformRoleAssignment: { findMany: mocks.roleFindMany },
    masterCalendarEntry: { findUnique: mocks.entryFindUnique }
  }
}));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/server/paly-bell-schedule", () => ({ loadPalyClassSessions: vi.fn().mockResolvedValue([]) }));
vi.mock("@/src/server/show-schedule", () => ({ loadScheduleOverrides: mocks.loadScheduleOverrides }));
vi.mock("@/src/server/show-roles-confirm", () => ({ loadShowAnchorNames: vi.fn() }));

import { runPaAnnouncerReminders } from "@/src/server/anchor-reminders";

// Monday, November 16, 2026 is a PA day. PST is UTC-8.
const pt = (dateKey: string, hhmm: string) => new Date(`${dateKey}T${hhmm}:00-08:00`);

describe("runPaAnnouncerReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindMany.mockResolvedValue([
      { id: "a", name: "Abby Lane", nickname: null, email: "abby@example.edu" },
      { id: "o", name: "Otto Park", nickname: null, email: "otto@example.edu" }
    ]);
    mocks.roleFindMany.mockResolvedValue([]);
    mocks.loadScheduleOverrides.mockResolvedValue(new Map());
    mocks.entryFindUnique.mockResolvedValue({ content: "<p>PA Announcers: Abby, Otto</p>" });
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("emails each PA announcer at 9 PM the night before", async () => {
    const result = await runPaAnnouncerReminders("night-before", pt("2026-11-15", "21:00"));
    expect(mocks.entryFindUnique).toHaveBeenCalledWith({ where: { date: "2026-11-16" }, select: { content: true } });
    expect(result).toMatchObject({ sent: 2, paDate: "2026-11-16", missing: [] });
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["abby@example.edu"]);
    expect(mail.subject).toBe("You're reading the PA tomorrow");
    expect(mail.paragraphs[1]).toMatch(/tomorrow \(Monday, November 16th, 2026\), at the start of second period/);
    expect(mail.ctaUrl).toMatch(/\/announcements\/pa$/);
    expect(mail.idempotencyKey).toBe("pa-reminder/2026-11-16/night-before/abby@example.edu");
  });

  it("emails at 8 AM on the PA day", async () => {
    const result = await runPaAnnouncerReminders("morning-of", pt("2026-11-16", "08:00"));
    expect(result).toMatchObject({ sent: 2, paDate: "2026-11-16" });
    expect(mocks.sendBrandedEmails.mock.calls[0][0].subject).toBe("You're reading the PA today");
  });

  it("sends nothing on a day without PA", async () => {
    const result = await runPaAnnouncerReminders("morning-of", pt("2026-11-17", "08:00"));
    expect(result).toMatchObject({ sent: 0, reason: "no PA" });
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });
});
