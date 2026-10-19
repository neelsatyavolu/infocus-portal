import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAppReviewPathAllowed } from "@/src/lib/app-review";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  role: vi.fn(),
  board: vi.fn(),
  pin: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ getSessionUser: mocks.session }));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformRoleForEmail: mocks.role }));
vi.mock("@/src/server/class-board", () => ({ loadClassBoard: mocks.board }));
vi.mock("@/src/server/class-board-pin", () => ({ classBoardPinAllowsAccess: mocks.pin }));

import { GET } from "@/app/api/class-board/route";

const board = {
  classSessions: [{ date: "2026-10-19", startsAt: "2026-10-19T16:00:00.000Z", endsAt: "2026-10-19T17:30:00.000Z" }],
  deadlines: [],
  generatedAt: "2026-10-19T15:00:00.000Z",
  cycleNumber: 2,
  cycleFocus: "Features",
  gates: [{ key: "pitching", label: "Pitch", dateLabel: "Oct 20" }],
  lanes: [],
  livestreams: [],
  days: []
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ userId: "user-1", email: "abby@example.edu" });
  mocks.role.mockResolvedValue(null);
  mocks.board.mockResolvedValue(board);
  mocks.pin.mockResolvedValue(false);
});

describe("GET /api/class-board", () => {
  it("returns the board for a signed-in member with their role", async () => {
    mocks.role.mockResolvedValue("EXECUTIVE_PRODUCER");
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(board);
    expect(mocks.board).toHaveBeenCalledWith("EXECUTIVE_PRODUCER");
    expect(mocks.pin).not.toHaveBeenCalled();
  });

  it("serves a PIN-unlocked browser with no role", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.pin.mockResolvedValue(true);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.board).toHaveBeenCalledWith(null);
  });

  it("refuses without a session or a PIN unlock", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.board).not.toHaveBeenCalled();
  });

  it("stays closed to the App Review account", () => {
    expect(isAppReviewPathAllowed("/api/class-board")).toBe(false);
  });
});
