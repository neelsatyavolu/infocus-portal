import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  roleFindMany: vi.fn(),
  loadShowAnchorNames: vi.fn(),
  sendBrandedEmails: vi.fn(),
  loadPalyClassSessions: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    platformRoleAssignment: { findMany: mocks.roleFindMany }
  }
}));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/server/paly-bell-schedule", () => ({ loadPalyClassSessions: mocks.loadPalyClassSessions }));
vi.mock("@/src/server/show-schedule", () => ({ loadScheduleOverrides: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/src/server/show-roles-confirm", () => ({ loadShowAnchorNames: mocks.loadShowAnchorNames }));

import { runAnchorReminders } from "@/src/server/anchor-reminders";

// Wednesday, October 14, 2026 is a show day, filmed in 1st period on Tuesday the 13th. PDT is UTC-7.
const pt = (dateKey: string, hhmm: string) => new Date(`${dateKey}T${hhmm}:00-07:00`);

describe("runAnchorReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindMany.mockResolvedValue([
      { name: "Abby Lane", nickname: null, email: "abby@example.edu" },
      { name: "Otto Park", nickname: null, email: "otto@example.edu" },
      { name: "Sage Hill", nickname: null, email: "sage@example.edu" }
    ]);
    mocks.roleFindMany.mockResolvedValue([]);
    mocks.loadShowAnchorNames.mockImplementation(async (date: string) => (date === "2026-10-14" ? ["Abby", "Otto"] : ["Sage"]));
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
    mocks.loadPalyClassSessions.mockResolvedValue(
      ["2026-10-13", "2026-10-15"].map((date) => ({
        date,
        startsAt: pt(date, "08:30").toISOString(),
        endsAt: pt(date, "10:00").toISOString()
      }))
    );
  });

  it("emails each anchor at 9 PM the night before filming", async () => {
    const result = await runAnchorReminders("night-before", pt("2026-10-12", "21:00"));
    expect(result).toMatchObject({ sent: 2, filmingDay: "2026-10-13", shows: ["2026-10-14"], missing: [] });
    const recipients = mocks.sendBrandedEmails.mock.calls.map((call) => call[0].recipients);
    expect(recipients).toEqual([["abby@example.edu"], ["otto@example.edu"]]);
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.subject).toBe("You're anchoring tomorrow");
    expect(mail.paragraphs[1]).toMatch(/filmed tomorrow in 1st period, starting at 8:30 AM/);
    expect(mail.ctaUrl).toMatch(/\/show-roles\?date=2026-10-14$/);
    expect(mail.idempotencyKey).toBe("anchor-reminder/2026-10-14/night-before/abby@example.edu");
  });

  it("emails each anchor at 8 AM on the filming day", async () => {
    const result = await runAnchorReminders("morning-of", pt("2026-10-15", "08:00"));
    expect(result).toMatchObject({ sent: 1, filmingDay: "2026-10-15", shows: ["2026-10-16"] });
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["sage@example.edu"]);
    expect(mail.subject).toBe("You're anchoring today");
    expect(mail.paragraphs[1]).toMatch(/filmed today in 1st period/);
  });

  it("sends nothing when no show is filmed that day", async () => {
    expect(await runAnchorReminders("morning-of", pt("2026-10-14", "08:00"))).toMatchObject({ sent: 0, reason: "no filming" });
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });

  it("skips anchors with no matching account", async () => {
    mocks.loadShowAnchorNames.mockResolvedValue(["Abby", "Nobody"]);
    const result = await runAnchorReminders("night-before", pt("2026-10-12", "21:00"));
    expect(result).toMatchObject({ sent: 1, missing: ["Nobody"] });
  });

  it("uses full names when two people share a first name", async () => {
    mocks.userFindMany.mockResolvedValue([
      { name: "Abby Lane", nickname: null, email: "abby.l@example.edu" },
      { name: "Abby Moss", nickname: null, email: "abby.m@example.edu" }
    ]);
    mocks.loadShowAnchorNames.mockResolvedValue(["Abby Moss"]);
    await runAnchorReminders("night-before", pt("2026-10-12", "21:00"));
    expect(mocks.sendBrandedEmails.mock.calls[0][0].recipients).toEqual(["abby.m@example.edu"]);
  });
});
