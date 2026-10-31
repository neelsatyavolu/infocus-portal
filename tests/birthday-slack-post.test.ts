import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findUsers: vi.fn(), slackApi: vi.fn(), join: vi.fn(), upload: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { findMany: m.findUsers } } }));
vi.mock("@/src/lib/slack-api", () => ({
  slackApi: m.slackApi,
  slackBotToken: () => process.env.SLACK_BOT_TOKEN ?? "",
  SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT: "CDEFAULT"
}));
vi.mock("@/src/server/slack-history", () => ({ ensureSlackChannelJoined: m.join }));
vi.mock("@/src/server/slack-upload", () => ({ uploadFileToSlack: m.upload }));
import { findTodaysBirthdays, postBirthdayGif } from "@/src/server/birthday-slack";

/** 00:00:30 Pacific on Saturday, November 7, 2026. */
const MIDNIGHT = new Date("2026-11-07T08:00:30Z");

const person = (name: string, email: string, month: number, day: number) => ({
  name,
  nickname: null,
  email,
  birthdayMonth: month,
  birthdayDay: day
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SLACK_BOT_TOKEN = "xoxb-test";
  delete process.env.SLACK_ANNOUNCEMENTS_CHANNEL;
});

describe("findTodaysBirthdays", () => {
  it("finds everyone born today and tags people Slack finds by email", async () => {
    m.findUsers.mockResolvedValue([
      person("Abby Lane", "abby@example.edu", 11, 7),
      person("Otto Park", "otto@example.edu", 11, 7),
      person("Sage Ruiz", "sage@example.edu", 11, 8)
    ]);
    m.slackApi.mockImplementation(async (_method: string, _token: string, { email }: { email: string }) =>
      email === "abby@example.edu" ? { ok: true, user: { id: "UABBY" } } : { ok: false, error: "users_not_found" }
    );

    expect(await findTodaysBirthdays(MIDNIGHT)).toEqual({
      people: [
        { name: "Abby", slackUserId: "UABBY" },
        { name: "Otto", slackUserId: null }
      ]
    });
  });

  it("finds no one when no birthday is today", async () => {
    m.findUsers.mockResolvedValue([person("Sage Ruiz", "sage@example.edu", 11, 8)]);
    expect(await findTodaysBirthdays(MIDNIGHT)).toEqual({ people: [], reason: "no birthdays" });
  });

  it("finds no one when Slack isn't set up", async () => {
    process.env.SLACK_BOT_TOKEN = "";
    expect(await findTodaysBirthdays(MIDNIGHT)).toEqual({ people: [], reason: "Slack not configured" });
    expect(m.findUsers).not.toHaveBeenCalled();
  });
});

describe("postBirthdayGif", () => {
  const people = [
    { name: "Abby", slackUserId: "UABBY" },
    { name: "Otto", slackUserId: null }
  ];
  const gif = Buffer.from([71, 73, 70]).toString("base64");

  it("shares the GIF in #announcements with the birthday message", async () => {
    expect(await postBirthdayGif(people, gif)).toEqual({ posted: true, count: 2 });
    expect(m.join).toHaveBeenCalledWith("xoxb-test", "CDEFAULT");
    expect(m.upload).toHaveBeenCalledWith({
      token: "xoxb-test",
      channel: "CDEFAULT",
      fileName: "happy-birthday-abby-otto.gif",
      contentType: "image/gif",
      bytes: new Uint8Array([71, 73, 70]),
      text: "🎂 Happy birthday, <@UABBY> and Otto! Hope it's a great one."
    });
  });

  it("uses the announcements channel from the environment", async () => {
    process.env.SLACK_ANNOUNCEMENTS_CHANNEL = "CENV";
    await postBirthdayGif(people, gif);
    expect(m.upload).toHaveBeenCalledWith(expect.objectContaining({ channel: "CENV" }));
  });
});
