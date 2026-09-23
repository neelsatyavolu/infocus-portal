import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  livestreamManager: { findUnique: vi.fn() },
  livestreamEvent: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  livestreamAttendee: { deleteMany: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn()
}));
const actor = vi.hoisted(() => ({ role: null as string | null }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "manager"),
  syncUserProfile: vi.fn(async () => ({ id: "manager", email: "manager@example.com" }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/platform-admin")>(),
  getPlatformAccess: vi.fn(async () => ({ role: actor.role }))
}));
vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: vi.fn(() => "test"), limitByKey: vi.fn(() => ({ allowed: true }))
}));
import { PATCH } from "@/app/api/livestreams/events/[eventId]/route";
import { POST } from "@/app/api/livestreams/events/route";

const patch = (body: unknown) => PATCH(new Request("http://localhost/api/livestreams/events/event", {
  method: "PATCH", body: JSON.stringify(body)
}), { params: Promise.resolve({ eventId: "event" }) });

beforeEach(() => {
  vi.clearAllMocks();
  actor.role = null;
  db.livestreamManager.findUnique.mockResolvedValue({ id: "manager" });
  const event = { id: "event", status: "COMPLETED", hours: 3, startsAt: new Date(), attendees: [] };
  db.livestreamEvent.findUnique.mockResolvedValue(event);
  db.livestreamEvent.update.mockResolvedValue(event);
  db.livestreamEvent.create.mockResolvedValue(event);
  db.$transaction.mockImplementation((fn) => fn(db));
});

describe("livestream credit editing", () => {
  it.each([1.25, 0, null])("lets an appointed manager save individual hours %s", async (creditHours) => {
    const response = await patch({ attendeeUserIds: ["student"], attendeeCredits: [{ userId: "student", creditHours }] });
    expect(response.status).toBe(200);
    expect(db.livestreamAttendee.upsert).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId: "event", userId: "student" } },
      create: { eventId: "event", userId: "student", creditHours }, update: { creditHours }
    });
  });
  it("preserves existing overrides when only the roster is supplied", async () => {
    expect((await patch({ attendeeUserIds: ["student"] })).status).toBe(200);
    expect(db.livestreamAttendee.upsert.mock.calls[0][0].update.creditHours).toBeUndefined();
  });
  it.each([1.5, 0])("updates event-wide credit to %s without deleting attendance", async (hours) => {
    expect((await patch({ hours })).status).toBe(200);
    expect(db.livestreamEvent.update.mock.calls[0][0].data.hours).toBe(hours);
    expect(db.livestreamAttendee.deleteMany).not.toHaveBeenCalled();
  });
  it.each([-1, 25, "2"])("rejects invalid hours %s before writing", async (creditHours) => {
    expect((await patch({ attendeeUserIds: ["student"], attendeeCredits: [{ userId: "student", creditHours }] })).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects overrides for users outside the supplied roster", async () => {
    expect((await patch({ attendeeUserIds: [], attendeeCredits: [{ userId: "student", creditHours: 1 }] })).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("blocks non-manager members", async () => {
    db.livestreamManager.findUnique.mockResolvedValue(null);
    expect((await patch({ hours: 0 })).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("retains producer access", async () => {
    db.livestreamManager.findUnique.mockResolvedValue(null);
    actor.role = "ASSOCIATE_PRODUCER";
    expect((await patch({ hours: 0 })).status).toBe(200);
  });
  it("saves individual overrides when creating an event", async () => {
    const response = await POST(new Request("http://localhost/api/livestreams/events", {
      method: "POST", body: JSON.stringify({ title: "Game", startsAt: "2026-09-18T12:00:00Z", status: "COMPLETED", hours: 3,
        attendeeUserIds: ["student"], attendeeCredits: [{ userId: "student", creditHours: 0 }] })
    }));
    expect(response.status).toBe(201);
    expect(db.livestreamEvent.create.mock.calls[0][0].data.attendees.create).toEqual([{ userId: "student", creditHours: 0 }]);
  });
});
