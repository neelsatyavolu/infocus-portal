import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), sync: vi.fn(), real: vi.fn(), update: vi.fn() }));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.sync,
  getRealSessionUser: mocks.real
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { update: mocks.update } } }));

import { GET, PATCH } from "@/app/api/profile/route";

const serialized = { email: "abby@example.edu", name: "Abby Example", nickname: null, birthdayMonth: null, birthdayDay: null };
const person = { id: "user-1", ...serialized };

function patch(body: unknown) {
  return PATCH(new Request("https://portal.example.edu/api/profile", { method: "PATCH", body: JSON.stringify(body) }));
}

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
    expect((await (await GET()).json()).data).toEqual({ ...serialized, sampleOnly: false });
  });

  it("flags the App Review account so the iPhone app shows only its sample", async () => {
    mocks.sync.mockResolvedValue({ ...person, email: "Review@Example.edu" });
    mocks.real.mockResolvedValue({ userId: "user-1", email: "Review@Example.edu" });
    expect((await (await GET()).json()).data.sampleOnly).toBe(true);
  });
});

describe("PATCH /api/profile", () => {
  beforeEach(() => {
    mocks.update.mockImplementation(async ({ data }) => ({ ...person, ...data }));
  });

  it("saves a birthday without touching the nickname", async () => {
    const response = await patch({ birthday: { month: 11, day: 8 } });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { birthdayMonth: 11, birthdayDay: 8 } })
    );
    expect((await response.json()).data).toMatchObject({ birthdayMonth: 11, birthdayDay: 8 });
  });

  it("clears a birthday", async () => {
    await patch({ birthday: null });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { birthdayMonth: null, birthdayDay: null } })
    );
  });

  it("saves a nickname without touching the birthday", async () => {
    await patch({ nickname: " Abs " });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nickname: "Abs" } }));
  });

  it("rejects a day the month doesn't have", async () => {
    const response = await patch({ birthday: { month: 2, day: 30 } });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
