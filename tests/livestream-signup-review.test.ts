import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  livestreamAttendee: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  livestreamSignupRequest: { updateMany: vi.fn() }
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  livestreamManager: { findUnique: vi.fn() },
  livestreamEvent: { findUnique: vi.fn() },
  livestreamAttendee: { findUnique: vi.fn() },
  livestreamSignupRequest: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "user"),
  syncUserProfile: vi.fn(async () => ({ id: "user", email: "user@example.com" }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: vi.fn(async () => ({ role: null }))
}));
vi.mock("@/src/server/livestream-access", () => ({
  requireLivestreamManagerAccess: vi.fn(async () => undefined),
  isLivestreamManager: vi.fn(async () => false)
}));
vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: vi.fn(() => "test"),
  limitByKey: vi.fn(() => ({ allowed: true }))
}));

import { PATCH } from "@/app/api/livestreams/signups/[signupId]/route";
import { POST } from "@/app/api/livestreams/signups/route";

function patch(status: "APPROVED" | "DENIED") {
  return PATCH(
    new Request("http://localhost/api/livestreams/signups/s1", { method: "PATCH", body: JSON.stringify({ status }) }),
    { params: Promise.resolve({ signupId: "s1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
  db.livestreamSignupRequest.findUnique.mockResolvedValue({ id: "s1", status: "PENDING", eventId: "event", userId: "otto" });
  tx.$queryRaw.mockResolvedValue([{ status: "SCHEDULED", capacity: 2 }]);
  tx.livestreamAttendee.count.mockResolvedValue(1);
  tx.livestreamAttendee.findUnique.mockResolvedValue(null);
  tx.livestreamSignupRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe("approving a livestream signup", () => {
  it("locks the event row and counts attendees inside the transaction", async () => {
    const response = await patch("APPROVED");
    expect(response.status).toBe(200);
    expect(String(tx.$queryRaw.mock.calls[0][0].join("?"))).toContain("FOR UPDATE");
    expect(tx.livestreamAttendee.count).toHaveBeenCalledWith({ where: { eventId: "event" } });
    expect(tx.livestreamAttendee.create).toHaveBeenCalledWith({ data: { eventId: "event", userId: "otto" } });
  });

  it("refuses when the locked count shows the event is full", async () => {
    tx.livestreamAttendee.count.mockResolvedValue(2);
    const response = await patch("APPROVED");
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("full");
    expect(tx.livestreamSignupRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.livestreamAttendee.create).not.toHaveBeenCalled();
  });

  it("does not add an attendee when another manager reviewed it first", async () => {
    tx.livestreamSignupRequest.updateMany.mockResolvedValue({ count: 0 });
    const response = await patch("APPROVED");
    expect(response.status).toBe(400);
    expect(tx.livestreamAttendee.create).not.toHaveBeenCalled();
  });

  it("denies only a still-pending request", async () => {
    db.livestreamSignupRequest.updateMany.mockResolvedValue({ count: 1 });
    const response = await patch("DENIED");
    expect(response.status).toBe(200);
    expect(db.livestreamSignupRequest.updateMany.mock.calls[0][0].where).toEqual({ id: "s1", status: "PENDING" });
  });
});

describe("requesting a livestream signup", () => {
  it("returns the existing request on a double submit instead of a 500", async () => {
    db.livestreamManager.findUnique.mockResolvedValue(null);
    db.livestreamEvent.findUnique.mockResolvedValue({ id: "event", status: "SCHEDULED", capacity: 4, _count: { attendees: 0 } });
    db.livestreamAttendee.findUnique.mockResolvedValue(null);
    const existing = { id: "s1", eventId: "event", status: "PENDING", availableFullEvent: true, note: "", createdAt: new Date() };
    db.livestreamSignupRequest.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    db.livestreamSignupRequest.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    const response = await POST(
      new Request("http://localhost/api/livestreams/signups", { method: "POST", body: JSON.stringify({ eventId: "event" }) })
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ id: "s1", status: "PENDING" });
  });
});
