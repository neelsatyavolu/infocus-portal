import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendBrandedEmails: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));

import {
  livestreamNudgeMail,
  livestreamNudgeSemester,
  selectLivestreamNudges,
  sendLivestreamHoursReminders
} from "@/src/server/livestream-hours-reminders";

const user = (id: string, email: string | null, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `${id[0]!.toUpperCase()}${id.slice(1)} Lane`,
  nickname: null,
  email,
  notificationEmail: null,
  ...overrides
});

describe("livestream hours reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("runs only in the two weeks before S1 livestream grades post (Dec 4, midnight Pacific)", () => {
    expect(livestreamNudgeSemester(new Date("2026-11-13T08:00:00-08:00"))).toBeNull();
    expect(livestreamNudgeSemester(new Date("2026-11-20T08:00:00-08:00"))?.label).toBe("2026-27 S1");
    expect(livestreamNudgeSemester(new Date("2026-11-27T08:00:00-08:00"))?.label).toBe("2026-27 S1");
    expect(livestreamNudgeSemester(new Date("2026-12-04T08:00:00-08:00"))).toBeNull();
  });

  it("nudges students short of 8 hours, skipping staff, livestream managers and removed accounts", () => {
    const nudges = selectLivestreamNudges({
      users: [
        user("abby", "abby@example.edu"),
        user("otto", "otto@example.edu", { notificationEmail: "otto.home@example.edu", nickname: "Ot" }),
        user("sage", "sage@example.edu"),
        user("mgr", "mgr@example.edu"),
        user("exec", "adviser@example.edu"),
        user("gone", null)
      ],
      nonGradableEmails: new Set(["adviser@example.edu"]),
      managerUserIds: new Set(["mgr"]),
      hoursByUser: new Map([
        ["abby", 3.25],
        ["sage", 8]
      ])
    });
    expect(nudges).toEqual([
      { userId: "abby", email: "abby@example.edu", name: "Abby", hoursDone: 3.3, hoursNeeded: 4.7 },
      { userId: "otto", email: "otto.home@example.edu", name: "Ot", hoursDone: 0, hoursNeeded: 8 }
    ]);
  });

  it("lists upcoming livestreams with open slots the student isn't already on", () => {
    const mail = livestreamNudgeMail(
      { userId: "abby", email: "abby@example.edu", name: "Abby", hoursDone: 3, hoursNeeded: 5 },
      new Date("2026-12-04T08:00:00Z"),
      [
        { id: "e1", title: "Football", startsAt: "2026-11-21T02:00:00.000Z", openSlots: 2, attendeeIds: [] },
        { id: "e2", title: "Choir", startsAt: new Date("2026-11-22T03:00:00Z"), openSlots: 1, attendeeIds: ["abby"] }
      ]
    );
    expect(mail.subject).toBe("You need 5 hours more of livestreams");
    expect(mail.paragraphs[1]).toMatch(/You have 3 hours .* need 8 .* 5 hours to go\. Livestream grades post on Friday, December 4/);
    expect(mail.paragraphs[2]).toBe("Livestreams with open slots: Football: Fri, Nov 20, 6:00 PM (2 open slots).");
  });

  it("sends one email per student with a per-day idempotency key", async () => {
    const result = await sendLivestreamHoursReminders({
      nudges: [{ userId: "abby", email: "abby@example.edu", name: "Abby", hoursDone: 0, hoursNeeded: 8 }],
      events: [],
      semesterLabel: "2026-27 S1",
      now: new Date("2026-11-20T08:00:00-08:00")
    });
    expect(result).toEqual({ sent: 1 });
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["abby@example.edu"]);
    expect(mail.ctaUrl).toMatch(/\/livestreams$/);
    expect(mail.idempotencyKey).toBe("livestream-hours-reminder/2026-27 S1/2026-11-20/abby");
  });
});
