import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  livestreamEvent: { count: vi.fn(), findMany: vi.fn() },
  livestreamAttendee: { findMany: vi.fn() },
  livestreamManager: { findMany: vi.fn() },
  platformRoleAssignment: { findMany: vi.fn() },
  user: { findMany: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "manager"),
  syncUserProfile: vi.fn(async () => ({ id: "manager", email: "manager@example.com" }))
}));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: vi.fn(async () => ({ role: null })),
  normalizeEmail: (email?: string | null) => email?.trim().toLowerCase() ?? "",
  PLATFORM_SUPER_ADMIN_EMAIL: "superadmin@example.edu",
  PACKAGE_ADVISER_EMAIL: "adviser@example.edu"
}));
vi.mock("@/src/server/livestream-access", () => ({ requireLivestreamManagerAccess: vi.fn() }));

import { completedLivestreamHoursByUserIds, completedLivestreamHoursForUser, resolveLivestreamPointsByUserIds, resolveLivestreamPointsForUser } from "@/src/server/livestream-credit";
import { livestreamPointsFromManagedCount, semesterForDate } from "@/src/lib/livestream";
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
  db.livestreamManager.findMany.mockResolvedValue([]);
  db.livestreamEvent.findMany.mockResolvedValue([]);
  db.platformRoleAssignment.findMany.mockResolvedValue([]);
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
  it("drops execs, the adviser, and the super admin from the completion roster but keeps APs", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "student", name: "Abby", email: "abby@example.edu" },
      { id: "ap", name: "Otto", email: "otto@example.edu" },
      { id: "ep", name: "Sage", email: "sage@example.edu" },
      { id: "adviser", name: "Adviser", email: "adviser@example.edu" },
      { id: "admin", name: "Admin", email: "superadmin@example.edu" }
    ]);
    const assignments = [
      { email: "Otto@example.edu", role: "ASSOCIATE_PRODUCER" },
      { email: "Sage@example.edu", role: "EXECUTIVE_PRODUCER" }
    ];
    db.platformRoleAssignment.findMany.mockImplementation(async (args: { where: { role: { in: string[] } } }) =>
      assignments.filter((entry) => args.where.role.in.includes(entry.role))
    );
    const { data } = await (await GET()).json();
    expect(data.rows.map((row: { userId: string }) => row.userId)).toEqual(["student", "ap"]);
  });
  it("grades livestream managers at 10 points per managed livestream, capped at 4", async () => {
    const releasedAt = new Date("2026-11-30T08:00:00Z");
    db.livestreamManager.findMany.mockResolvedValue([{ userId: "sage" }]);
    const managed = (count: number, hours: number | null = 2) =>
      Array.from({ length: count }, () => ({ managerUserId: "sage", hours, startsAt: at }));

    db.livestreamEvent.findMany.mockResolvedValue([...managed(2), ...managed(1, 0)]);
    expect(await resolveLivestreamPointsForUser("sage", releasedAt)).toBe(20);
    expect((await resolveLivestreamPointsByUserIds(["sage", "student"], releasedAt)).get("sage")).toBe(20);
    expect((await resolveLivestreamPointsByUserIds(["sage", "student"], releasedAt)).get("student")).toBe(21);

    db.livestreamEvent.findMany.mockResolvedValue(managed(6));
    expect(await resolveLivestreamPointsForUser("sage", releasedAt)).toBe(40);
  });
  it("shows managed livestreams in the completion roster for managers", async () => {
    db.user.findMany.mockResolvedValue([{ id: "sage", name: "Sage", email: "sage@example.edu" }]);
    db.livestreamManager.findMany.mockResolvedValue([{ userId: "sage" }]);
    db.livestreamEvent.findMany.mockImplementation(async (args: { where: { managerUserId?: unknown } }) =>
      args.where.managerUserId
        ? [1, 2, 3].map(() => ({ managerUserId: "sage", hours: 2, startsAt: at }))
        : []
    );
    const { data } = await (await GET()).json();
    expect(data.rows[0]).toMatchObject({ isManager: true, managedEvents: 3, creditPercent: 75, points: 30 });
  });
  it("maps managed counts to points", () => {
    expect([0, 1, 4, 9].map(livestreamPointsFromManagedCount)).toEqual([0, 10, 40, 40]);
  });
  it("leaves grades ungraded until a completed event exists", async () => {
    db.livestreamEvent.count.mockResolvedValue(0);
    const releasedAt = new Date("2026-11-30T08:00:00Z");
    expect(await resolveLivestreamPointsForUser("student", releasedAt)).toBeNull();
    expect((await resolveLivestreamPointsByUserIds(["student"], releasedAt)).get("student")).toBeNull();
  });
});
