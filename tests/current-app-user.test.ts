import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn();
const getPlatformRoleForEmail = vi.fn();

vi.mock("@/src/lib/auth", () => ({
  getSessionUser
}));

vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformRoleForEmail
}));

describe("getCurrentAppUser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getSessionUser.mockResolvedValue({
      userId: "user_123",
      email: "producer@infocus.test",
      name: "Producer One",
      imageUrl: "https://example.com/producer.png"
    });
    getPlatformRoleForEmail.mockResolvedValue("ASSOCIATE_PRODUCER");
  });

  it("builds page auth context from the session without reloading the prisma user record", async () => {
    const { getCurrentAppUser } = await import("@/src/lib/current-app-user");

    await expect(getCurrentAppUser()).resolves.toEqual({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "producer@infocus.test",
        imageUrl: "https://example.com/producer.png",
        name: "Producer One"
      },
      platformRole: "ASSOCIATE_PRODUCER"
    });

    expect(getSessionUser).toHaveBeenCalledTimes(1);
    expect(getPlatformRoleForEmail).toHaveBeenCalledTimes(1);
  });
});
