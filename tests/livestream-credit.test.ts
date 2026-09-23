import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  livestreamEvent: { count: vi.fn(), findMany: vi.fn() },
  livestreamAttendee: { findMany: vi.fn() },
  user: { findMany: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "manager"),
  syncUserProfile: vi.fn(async () => ({ id: "manager", email: "manager@example.com" }))
}));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformAccess: vi.fn(async () => ({ role: null })) }));
vi.mock("@/src/server/livestream-access", () => ({ requireLivestreamManagerAccess: vi.fn() }));

import { completedLivestreamHoursByUserIds, completedLivestreamHoursForUser, resolveLivestreamPointsByUserIds, resolveLivestreamPointsForUser } from "@/src/server/livestream-credit";
import { semesterForDate } from "@/src/lib/livestream";
import { GET } from "@/app/api/livestreams/completion/route";

const at = new Date("2026-09-18T12:00:00Z");
const rows = [
  { userId: "student", creditHours: null, event: { hours: 3, startsAt: at } },
  { userId: "student", creditHours: 1.25, event: { hours: 3, startsAt: at } },
  { userId: "student", creditHours: 0, event: { hours: 3, startsAt: at } },
  { userId: "student", creditHours: 2, event: { hours: 0, startsAt: at } }
];
beforeEach(() => {
  vi.clearAllMocks();
  db.livestreamEvent.count.mockResolvedValue(4);
  db.livestreamAttendee.findMany.mockResolvedValue(rows);
});

describe("adjusted livestream credit", () => {
  it("uses defaults and individual overrides, preserving zero and cancelling all credit on zero-hour events", async () => {
    expect(await completedLivestreamHoursForUser("student", semesterForDate(at))).toBe(4.25);
  });
  it("keeps individual and batch official grades consistent", async () => {
    const releasedAt = new Date("2026-11-30T08:00:00Z");
    expect(await resolveLivestreamPointsForUser("student", releasedAt)).toBe(21);
    expect((await resolveLivestreamPointsByUserIds(["student"], releasedAt)).get("student")).toBe(21);
  });
  it.each([at, new Date("2026-11-30T07:59:59.999Z")])("excludes points before November 30 Pacific while preserving hours (%s)", async (now) => {
    expect(await resolveLivestreamPointsForUser("student", now)).toBeNull();
    expect((await resolveLivestreamPointsByUserIds(["student"], now)).get("student")).toBeNull();
    expect(await completedLivestreamHoursForUser("student", semesterForDate(now))).toBe(4.25);
    expect((await completedLivestreamHoursByUserIds(["student"], semesterForDate(now))).get("student")).toBe(4.25);
  });
  it("preserves Semester 2 grading and gives non-attendees zero after release", async () => {
    const now = new Date("2027-02-01T12:00:00Z");
    db.livestreamAttendee.findMany.mockResolvedValue([]);
    expect(await resolveLivestreamPointsForUser("student", now)).toBe(0);
    expect((await resolveLivestreamPointsByUserIds(["student"], now)).get("student")).toBe(0);
  });
  it("uses the same adjusted hours in the completion roster", async () => {
    db.user.findMany.mockResolvedValue([{ id: "student", name: "Student", email: "s@example.com" }]);
    db.livestreamEvent.findMany.mockResolvedValue(rows.map((row, index) => ({
      ...row.event, id: String(index), attendees: [{ userId: row.userId, creditHours: row.creditHours }]
    })));
    const response = await GET();
    const { data } = await response.json();
    expect(data.rows[0]).toMatchObject({ completedHours: 4.25, points: 21, completedEvents: 4 });
  });
  it("leaves grades ungraded until a completed event exists", async () => {
    db.livestreamEvent.count.mockResolvedValue(0);
    const releasedAt = new Date("2026-11-30T08:00:00Z");
    expect(await resolveLivestreamPointsForUser("student", releasedAt)).toBeNull();
    expect((await resolveLivestreamPointsByUserIds(["student"], releasedAt)).get("student")).toBeNull();
  });
});
