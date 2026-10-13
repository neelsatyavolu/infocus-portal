import { beforeEach, describe, expect, it, vi } from "vitest";

type Signup = {
  id: string;
  eventId: string;
  userId: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
};

const state = vi.hoisted(() => ({
  capacity: 1,
  eventStatus: "SCHEDULED",
  attendees: [] as string[],
  signups: new Map<string, Signup>()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "manager"),
  syncUserProfile: vi.fn(async () => ({ id: "manager", email: "manager@example.com" }))
}));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: vi.fn(async () => ({ role: "ASSOCIATE_PRODUCER" }))
}));
vi.mock("@/src/lib/rate-limit", () => ({
  getRequestKey: vi.fn(() => "test"),
  limitByKey: vi.fn(() => ({ allowed: true }))
}));
vi.mock("@/src/server/livestream-access", () => ({
  requireLivestreamManagerAccess: vi.fn(async () => undefined)
}));
vi.mock("@/src/lib/prisma", () => {
  function cloneState() {
    return {
      capacity: state.capacity,
      eventStatus: state.eventStatus,
      attendees: [...state.attendees],
      signups: new Map([...state.signups].map(([id, signup]) => [id, { ...signup }]))
    };
  }

  const tx = {
    $queryRaw: async () => [{ capacity: state.capacity, status: state.eventStatus }],
    livestreamSignupRequest: {
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Signup> }) => {
        const signup = state.signups.get(where.id);
        if (!signup || signup.status !== where.status) return { count: 0 };
        state.signups.set(where.id, { ...signup, ...data });
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const signup = state.signups.get(where.id);
        if (!signup) throw new Error("missing");
        return signup;
      }
    },
    livestreamAttendee: {
      upsert: async ({ create }: { create: { userId: string } }) => {
        if (!state.attendees.includes(create.userId)) state.attendees.push(create.userId);
      },
      count: async () => state.attendees.length
    }
  };

  return {
    prisma: {
      livestreamSignupRequest: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const signup = state.signups.get(where.id);
          if (!signup) return null;
          return { ...signup, event: { id: signup.eventId, status: state.eventStatus, capacity: state.capacity } };
        },
        updateMany: tx.livestreamSignupRequest.updateMany,
        findUniqueOrThrow: tx.livestreamSignupRequest.findUniqueOrThrow
      },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
        const snapshot = cloneState();
        try {
          return await fn(tx);
        } catch (error) {
          state.capacity = snapshot.capacity;
          state.eventStatus = snapshot.eventStatus;
          state.attendees = snapshot.attendees;
          state.signups = snapshot.signups;
          throw error;
        }
      }
    }
  };
});

import { PATCH } from "@/app/api/livestreams/signups/[signupId]/route";

function signup(id: string, userId: string): Signup {
  return { id, eventId: "event", userId, status: "PENDING", reviewedAt: null, reviewedByUserId: null };
}

function review(id: string, status: "APPROVED" | "DENIED") {
  return PATCH(new Request("http://localhost/api/livestreams/signups/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  }), { params: Promise.resolve({ signupId: id }) });
}

beforeEach(() => {
  state.capacity = 1;
  state.eventStatus = "SCHEDULED";
  state.attendees = [];
  state.signups = new Map([
    ["one", signup("one", "student-a")],
    ["two", signup("two", "student-b")]
  ]);
});

describe("livestream signup review", () => {
  it("approves one signup and refuses a second once the event is full", async () => {
    expect((await review("one", "APPROVED")).status).toBe(200);
    expect(state.signups.get("one")?.status).toBe("APPROVED");
    expect(state.attendees).toEqual(["student-a"]);

    const second = await review("two", "APPROVED");
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({ error: { message: "This livestream is full." } });
    expect(state.signups.get("two")?.status).toBe("PENDING");
    expect(state.attendees).toEqual(["student-a"]);
  });

  it("does not deny a signup that was already approved", async () => {
    expect((await review("one", "APPROVED")).status).toBe(200);
    const denied = await review("one", "DENIED");
    expect(denied.status).toBe(400);
    expect(state.signups.get("one")?.status).toBe("APPROVED");
  });
});
