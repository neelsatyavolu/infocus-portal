import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getSessionUser: vi.fn(),
  slackAnnouncements: vi.fn(),
  ideaBatch: vi.fn(),
  ideaDates: vi.fn(),
  slackSync: vi.fn(),
  role: vi.fn(),
  board: vi.fn(),
  pin: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  syncUserProfile: mocks.syncUserProfile,
  getSessionUser: mocks.getSessionUser
}));
vi.mock("@/src/server/slack-announcements", () => ({ loadSlackAnnouncements: mocks.slackAnnouncements }));
vi.mock("@/src/server/ideas", () => ({ getIdeaBatch: mocks.ideaBatch, listIdeaRunDates: mocks.ideaDates }));
vi.mock("@/src/server/slack-sync", () => ({ syncSlackOnStart: mocks.slackSync }));
vi.mock("@/src/lib/platform-admin", () => ({ getPlatformRoleForEmail: mocks.role }));
vi.mock("@/src/server/class-board", () => ({ loadClassBoard: mocks.board }));
vi.mock("@/src/server/class-board-pin", () => ({ classBoardPinAllowsAccess: mocks.pin }));

import { GET as getSlackAnnouncements } from "@/app/api/announcements/slack/route";
import { GET as getIdeas } from "@/app/api/ideas/route";
import { POST as postSlackSync } from "@/app/api/slack/sync/route";
import { GET as getThanksgivingStatus } from "@/app/api/thanksgiving/status/route";
import { GET as getClassBoard } from "@/app/api/class-board/route";

beforeEach(() => {
  vi.clearAllMocks();
  // A validly signed cookie for an account that was removed afterwards.
  mocks.requireUserId.mockResolvedValue("user-otto");
  mocks.getSessionUser.mockResolvedValue({ userId: "user-otto", email: "otto@example.edu" });
  mocks.syncUserProfile.mockRejectedValue(new Error("FORBIDDEN"));
  mocks.slackAnnouncements.mockResolvedValue({ configured: true, items: [], error: null });
  mocks.ideaBatch.mockResolvedValue(null);
  mocks.ideaDates.mockResolvedValue([]);
  mocks.slackSync.mockResolvedValue({});
  mocks.role.mockResolvedValue("EXECUTIVE_PRODUCER");
  mocks.board.mockResolvedValue({});
  mocks.pin.mockResolvedValue(false);
});

describe("signed-in routes reject a removed account's cookie", () => {
  it("announcements/slack", async () => {
    expect((await getSlackAnnouncements()).status).toBe(403);
    expect(mocks.syncUserProfile).toHaveBeenCalledWith("user-otto");
    expect(mocks.slackAnnouncements).not.toHaveBeenCalled();
  });

  it("ideas", async () => {
    expect((await getIdeas(new Request("https://portal.example.edu/api/ideas"))).status).toBe(403);
    expect(mocks.ideaBatch).not.toHaveBeenCalled();
  });

  it("slack/sync", async () => {
    expect((await postSlackSync()).status).toBe(403);
    expect(mocks.slackSync).not.toHaveBeenCalled();
  });

  it("thanksgiving/status", async () => {
    expect((await getThanksgivingStatus()).status).toBe(403);
  });

  it("still serves a live account", async () => {
    mocks.syncUserProfile.mockResolvedValue({ id: "user-otto", email: "otto@example.edu" });
    expect((await getSlackAnnouncements()).status).toBe(200);
    expect((await getIdeas(new Request("https://portal.example.edu/api/ideas"))).status).toBe(200);
    expect((await postSlackSync()).status).toBe(200);
    expect((await getThanksgivingStatus()).status).toBe(200);
  });
});

describe("class board: a session stands in for the PIN only for a live account", () => {
  it("refuses a removed account without the PIN", async () => {
    expect((await getClassBoard()).status).toBe(401);
    expect(mocks.board).not.toHaveBeenCalled();
  });

  it("serves a removed account's browser only through the PIN, with no role", async () => {
    mocks.pin.mockResolvedValue(true);
    expect((await getClassBoard()).status).toBe(200);
    expect(mocks.board).toHaveBeenCalledWith(null);
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it("serves a live account with its role", async () => {
    mocks.syncUserProfile.mockResolvedValue({ id: "user-otto", email: "otto@example.edu" });
    expect((await getClassBoard()).status).toBe(200);
    expect(mocks.board).toHaveBeenCalledWith("EXECUTIVE_PRODUCER");
  });
});
