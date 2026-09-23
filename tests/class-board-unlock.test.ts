import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLASS_BOARD_PIN_COOKIE_NAME, encryptClassBoardPin } from "@/src/lib/class-board-pin";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  real: vi.fn(),
  role: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: vi.fn(), set: m.set }) }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    programSetting: {
      findUnique: m.findUnique,
      update: m.update,
      upsert: vi.fn()
    }
  }
}));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: m.real }));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformRoleForEmail: m.role,
  isPlatformSuperAdmin: (role: string | null) => role === "SUPER_ADMIN" || role === "ADVISER"
}));

import { POST as unlock } from "@/app/api/class-board/unlock/route";
import { GET as readPin } from "@/app/api/class-board/pin/route";

const SECRET = "test-secret";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    id: "singleton",
    cyclesPerSemester: 3,
    classBoardPinCipher: encryptClassBoardPin("482193", SECRET),
    classBoardPinFailures: 0,
    classBoardPinFailureAt: null,
    ...overrides
  };
}

describe("class board pin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_AUTH_SECRET = SECRET;
    m.findUnique.mockResolvedValue(settings());
    m.update.mockResolvedValue(settings());
    m.real.mockResolvedValue({ email: "superadmin@example.edu" });
    m.role.mockResolvedValue("SUPER_ADMIN");
  });

  it("sets a class-board-only cookie for the right pin", async () => {
    const response = await unlock(new Request("http://localhost/api/class-board/unlock", {
      method: "POST",
      body: JSON.stringify({ pin: "482193" })
    }));
    expect(response.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith(
      CLASS_BOARD_PIN_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ path: "/class-board", httpOnly: true })
    );
  });

  it("does not set a cookie for the wrong pin", async () => {
    const response = await unlock(new Request("http://localhost/api/class-board/unlock", {
      method: "POST",
      body: JSON.stringify({ pin: "000000" })
    }));
    expect(response.status).toBe(401);
    expect(m.set).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalled();
  });

  it("hides the pin from anyone who is not a super admin", async () => {
    m.role.mockResolvedValue("EXECUTIVE_PRODUCER");
    expect((await readPin()).status).toBe(403);
  });
});
