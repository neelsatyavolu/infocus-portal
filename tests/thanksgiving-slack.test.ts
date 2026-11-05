import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_HARVEST, HARVEST_CONTEST, rankBoard } from "@/src/lib/thanksgiving-board";
import {
  harvestBreakdown,
  harvestSlackFileName,
  harvestSlackPostKind,
  harvestSlackText
} from "@/src/lib/thanksgiving-slack";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  upload: vi.fn(),
  join: vi.fn(),
  board: vi.fn(),
  contest: vi.fn(),
  settle: vi.fn(),
  render: vi.fn()
}));

vi.mock("@/src/lib/slack-api", () => ({ slackBotToken: mocks.token, SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT: "C-ANNOUNCE" }));
vi.mock("@/src/server/slack-upload", () => ({ uploadFileToSlack: mocks.upload }));
vi.mock("@/src/server/slack-history", () => ({ ensureSlackChannelJoined: mocks.join }));
vi.mock("@/src/server/thanksgiving-scores", () => ({ loadHarvestBoard: mocks.board }));
vi.mock("@/src/server/thanksgiving-contest", () => ({ loadHarvestContest: mocks.contest, settleHarvestContest: mocks.settle }));
vi.mock("@/src/server/thanksgiving-slack-image", () => ({ renderHarvestSlackImage: mocks.render }));
vi.mock("@/src/server/thanksgiving-harvest-hour", () => ({
  harvestHour: () => ({ startsAt: new Date("2026-11-05T17:00:00-08:00"), endsAt: new Date("2026-11-05T18:00:00-08:00") })
}));
vi.mock("@/src/lib/hosts", () => ({ mainAppOrigin: () => "https://portal.example.edu/" }));

import { harvestFooter, runHarvestSlackPost } from "@/src/server/thanksgiving-slack";

const CLOSE = HARVEST_CONTEST.closesAt.getTime();
const rows = rankBoard(
  ["Abby", "Otto", "Sage", "Player Four", "Player Five", "Player Six"].map((name, index) => ({
    ...EMPTY_HARVEST,
    bonus: 0,
    userId: name,
    name,
    leaves: 60 - index * 10
  }))
);

describe("harvestSlackPostKind", () => {
  it("posts standings until the close, the final standings within the hour after, then nothing", () => {
    expect(harvestSlackPostKind(new Date("2026-11-05T09:00:00-08:00"))).toBe("standings");
    expect(harvestSlackPostKind(new Date(CLOSE))).toBe("standings");
    expect(harvestSlackPostKind(new Date("2026-11-06T00:00:00-08:00"))).toBe("final");
    expect(harvestSlackPostKind(new Date("2026-11-06T06:00:00-08:00"))).toBeNull();
  });
});

describe("Slack copy", () => {
  it("is a heading and the board link", () => {
    expect(harvestSlackText({ kind: "standings", boardUrl: "https://example.edu/thanksgiving" })).toBe(
      "*Thanksgiving leaderboard*\n<https://example.edu/thanksgiving|See the whole board>"
    );
    expect(harvestSlackText({ kind: "final", boardUrl: "u" })).toMatch(/^\*Thanksgiving leaderboard: final standings\*/);
  });

  it("lists only what someone caught, one in the singular", () => {
    expect(harvestBreakdown({ ...EMPTY_HARVEST, leaves: 212, goldenLeaves: 1, giantTurkeys: 2 })).toBe(
      "212 leaves · 1 golden leaf · 2 giant turkeys"
    );
  });

  it("names the file by the hour", () => {
    expect(harvestSlackFileName(new Date("2026-11-05T18:00:00-08:00"))).toBe("thanksgiving-leaderboard-2026-11-06-02.png");
  });

  it("puts the prize, harvest hour or the winner under the five", () => {
    expect(harvestFooter("standings", null, false)).toBe(
      "First at 11:59 PM Thu, Nov 5 wins 2 extension days for their whole package group."
    );
    expect(harvestFooter("standings", null, true)).toMatch(/^Harvest hour is on: everything counts double\./);
    expect(harvestFooter("final", { winners: [{ userId: "a", name: "Abby" }], total: 60, ungranted: [] }, false)).toBe(
      "Abby wins 2 extension days for their package group."
    );
  });
});

describe("runHarvestSlackPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("xoxb-test");
    mocks.board.mockResolvedValue({ year: 2026, rows, disqualified: [] });
    mocks.contest.mockResolvedValue({ winners: [{ userId: "Abby", name: "Abby" }], total: 60, ungranted: [] });
    mocks.render.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("posts a picture of the top five to #announcements", async () => {
    const now = new Date("2026-11-05T17:30:00-08:00");
    await expect(runHarvestSlackPost(now)).resolves.toEqual({ posted: true, kind: "standings", count: 5 });
    const image = mocks.render.mock.calls[0][0];
    expect(image.rows.map((row: { name: string }) => row.name)).toEqual(["Abby", "Otto", "Sage", "Player Four", "Player Five"]);
    expect(image.title).toBe("Top 5");
    expect(image.footer).toMatch(/^Harvest hour is on/);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C-ANNOUNCE",
        contentType: "image/png",
        text: "*Thanksgiving leaderboard*\n<https://portal.example.edu/thanksgiving|See the whole board>"
      })
    );
  });

  it("settles the contest and names the winner on the final post", async () => {
    await runHarvestSlackPost(new Date("2026-11-06T00:00:00-08:00"));
    expect(mocks.settle).toHaveBeenCalled();
    expect(mocks.render.mock.calls[0][0]).toMatchObject({ title: "Final standings", footer: "Abby wins 2 extension days for their package group." });
  });

  it("skips without Slack, after the final post, or with nobody on the board", async () => {
    mocks.token.mockReturnValue("");
    expect((await runHarvestSlackPost(new Date("2026-11-05T09:00:00-08:00"))).posted).toBe(false);
    mocks.token.mockReturnValue("xoxb-test");
    expect(await runHarvestSlackPost(new Date("2026-11-07T09:00:00-08:00"))).toEqual({ posted: false, reason: "contest over" });
    mocks.board.mockResolvedValue({ year: 2026, rows: [], disqualified: [] });
    expect(await runHarvestSlackPost(new Date("2026-11-05T09:00:00-08:00"))).toEqual({ posted: false, reason: "nobody on the board" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
