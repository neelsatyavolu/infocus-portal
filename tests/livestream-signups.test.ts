import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  livestreamManager: { findUnique: vi.fn(), findMany: vi.fn() },
  livestreamEvent: { findUnique: vi.fn(), findMany: vi.fn() },
  livestreamAttendee: { findUnique: vi.fn() },
  livestreamSignupRequest: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() }
}));
const actor = vi.hoisted(() => ({ role: null as string | null }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "user"),
  syncUserProfile: vi.fn(async () => ({ id: "user", email: "user@example.com" }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/platform-admin")>(),
  getPlatformAccess: vi.fn(async () => ({ role: actor.role }))
}));
vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: vi.fn(() => "test"),
  limitByKey: vi.fn(() => ({ allowed: true }))
}));

import { POST } from "@/app/api/livestreams/signups/route";
import { GET } from "@/app/api/livestreams/route";

beforeEach(() => {
  vi.clearAllMocks();
  actor.role = null;
  db.livestreamManager.findUnique.mockResolvedValue(null);
  db.livestreamManager.findMany.mockResolvedValue([]);
  db.livestreamEvent.findMany.mockResolvedValue([]);
  db.livestreamSignupRequest.findMany.mockResolvedValue([]);
  db.livestreamEvent.findUnique.mockResolvedValue({
    id: "event", status: "SCHEDULED", capacity: 5, _count: { attendees: 0 }
  });
  db.livestreamAttendee.findUnique.mockResolvedValue(null);
  db.livestreamSignupRequest.findUnique.mockResolvedValue(null);
  db.livestreamSignupRequest.create.mockResolvedValue({
    id: "signup", eventId: "event", status: "PENDING",
    availableFullEvent: true, note: "", createdAt: new Date()
  });
});

describe("livestream signup eligibility", () => {
  it.each([null, "ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"])(
    "allows role %s unless appointed as a livestream manager", async (role) => {
      actor.role = role;
      const payload = await (await GET()).json();
      expect(payload.data.canSignup).toBe(true);
      const response = await POST(new Request("http://localhost/api/livestreams/signups", {
        method: "POST", body: JSON.stringify({ eventId: "event" })
      }));
      expect(response.status).toBe(201);
      expect(db.livestreamSignupRequest.create).toHaveBeenCalledOnce();
    }
  );

  it.each([null, "ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER"])(
    "blocks appointed managers with role %s", async (role) => {
      actor.role = role;
      db.livestreamManager.findUnique.mockResolvedValue({ id: "manager" });
      const payload = await (await GET()).json();
      expect(payload.data.canSignup).toBe(false);
      const response = await POST(new Request("http://localhost/api/livestreams/signups", {
        method: "POST", body: JSON.stringify({ eventId: "event" })
      }));
      expect(response.status).toBe(403);
      expect(db.livestreamSignupRequest.create).not.toHaveBeenCalled();
    }
  );
});
