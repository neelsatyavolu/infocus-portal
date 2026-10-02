import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), sync: vi.fn(), real: vi.fn() }));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.sync,
  getRealSessionUser: mocks.real
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import { GET } from "@/app/api/profile/route";

const person = { email: "abby@example.edu", name: "Abby Example", nickname: null };

beforeEach(() => {
  vi.stubEnv("APP_REVIEW_EMAIL", "review@example.edu");
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.sync.mockResolvedValue(person);
  mocks.real.mockResolvedValue({ userId: "user-1", email: person.email });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/profile", () => {
  it("says an ordinary account is not sample-only", async () => {
    expect((await (await GET()).json()).data).toEqual({ ...person, sampleOnly: false });
  });

  it("flags the App Review account so the iPhone app shows only its sample", async () => {
    mocks.sync.mockResolvedValue({ ...person, email: "Review@Example.edu" });
    mocks.real.mockResolvedValue({ userId: "user-1", email: "Review@Example.edu" });
    expect((await (await GET()).json()).data.sampleOnly).toBe(true);
  });
});
