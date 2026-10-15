import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  showFindUnique: vi.fn(),
  sendBrandedEmails: vi.fn(),
  loadPalyClassSessions: vi.fn(),
  resolveShowManagers: vi.fn(),
  findShowManagerEmail: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    showRolesConfirmation: { findUnique: mocks.findUnique, upsert: mocks.upsert, updateMany: mocks.updateMany },
    showRolesShow: { findUnique: mocks.showFindUnique },
    masterCalendarEntry: { findUnique: vi.fn().mockResolvedValue(null) }
  }
}));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/server/paly-bell-schedule", () => ({ loadPalyClassSessions: mocks.loadPalyClassSessions }));
vi.mock("@/src/server/show-schedule", () => ({ loadScheduleOverrides: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/src/server/show-manager", () => ({
  resolveShowManagers: mocks.resolveShowManagers,
  findShowManagerEmail: mocks.findShowManagerEmail
}));

import { runShowRolesConfirmReminders } from "@/src/server/show-roles-confirm";

// Wednesday, October 14, 2026 is a show day. PDT is UTC-7.
const pt = (dateKey: string, hhmm: string) => new Date(`${dateKey}T${hhmm}:00-07:00`);

describe("runShowRolesConfirmReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.showFindUnique.mockResolvedValue({
      assignments: { "Show Director": "Sage" },
      anchors: ["Abby", "Otto"]
    });
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
    mocks.loadPalyClassSessions.mockResolvedValue([
      { date: "2026-10-14", startsAt: pt("2026-10-14", "08:25").toISOString(), endsAt: pt("2026-10-14", "09:55").toISOString() }
    ]);
    mocks.resolveShowManagers.mockResolvedValue({ pool: [], managers: { "2026-10-14": { name: "Otto", source: "rotation" } } });
    mocks.findShowManagerEmail.mockResolvedValue("otto@example.edu");
  });

  it("does nothing while the show is still being filmed", async () => {
    expect(await runShowRolesConfirmReminders(pt("2026-10-14", "09:00"))).toMatchObject({ sent: 0 });
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });

  it("emails the show manager with the roles and a link to that show", async () => {
    expect(await runShowRolesConfirmReminders(pt("2026-10-14", "10:00"))).toEqual({ sent: 1, date: "2026-10-14" });
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["otto@example.edu"]);
    expect(mail.ctaUrl).toMatch(/\/show-roles\?date=2026-10-14$/);
    expect(mail.paragraphs).toContain("Anchors: Abby, Otto");
    expect(mail.paragraphs).toContain("Show Director: Sage");
  });

  it("stops once the roles are confirmed", async () => {
    mocks.findUnique.mockResolvedValue({ confirmedAt: pt("2026-10-14", "10:30"), lastReminderAt: pt("2026-10-14", "10:00") });
    expect(await runShowRolesConfirmReminders(pt("2026-10-14", "13:00"))).toMatchObject({ sent: 0 });
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });

  it("keeps reminding about the last show until the next show day", async () => {
    mocks.findUnique.mockResolvedValue({ confirmedAt: null, lastReminderAt: pt("2026-10-15", "07:00") });
    expect(await runShowRolesConfirmReminders(pt("2026-10-15", "10:00"))).toEqual({ sent: 1, date: "2026-10-14" });
  });

  it("skips when another run already claimed the reminder", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await runShowRolesConfirmReminders(pt("2026-10-14", "10:00"))).toMatchObject({ sent: 0 });
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
  });

  it("releases the claim when the email fails, so the next run retries", async () => {
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 0, failed: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runShowRolesConfirmReminders(pt("2026-10-14", "10:00"))).toMatchObject({ sent: 0, reason: "email failed" });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { lastReminderAt: null, reminderCount: { decrement: 1 } } })
    );
  });
});
