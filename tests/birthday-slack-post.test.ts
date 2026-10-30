import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findUsers: vi.fn(), slackApi: vi.fn(), join: vi.fn(), upload: vi.fn(), render: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { findMany: m.findUsers } } }));
vi.mock("@/src/lib/slack-api", () => ({
  slackApi: m.slackApi,
  slackBotToken: () => process.env.SLACK_BOT_TOKEN ?? "",
  SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT: "CDEFAULT"
}));
vi.mock("@/src/server/slack-history", () => ({ ensureSlackChannelJoined: m.join }));
vi.mock("@/src/server/slack-upload", () => ({ uploadFileToSlack: m.upload }));
vi.mock("@/src/server/birthday-slack-gif", () => ({ renderBirthdayGif: m.render }));
import { runBirthdaySlackPost } from "@/src/server/birthday-slack";

/** 00:00:30 Pacific on Saturday, November 7, 2026. */
const MIDNIGHT = new Date("2026-11-07T08:00:30Z");

const person = (name: string, email: string, month: number, day: number) => ({
  name,
  nickname: null,
  email,
  birthdayMonth: month,
  birthdayDay: day
});

describe("runBirthdaySlackPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    delete process.env.SLACK_ANNOUNCEMENTS_CHANNEL;
    m.render.mockResolvedValue(new Uint8Array([71, 73, 70]));
  });

  it("posts one GIF for everyone born today, tagging people Slack finds by email", async () => {
    m.findUsers.mockResolvedValue([
      person("Abby Lane", "abby@example.edu", 11, 7),
      person("Otto Park", "otto@example.edu", 11, 7),
      person("Sage Ruiz", "sage@example.edu", 11, 8)
    ]);
    m.slackApi.mockImplementation(async (_method: string, _token: string, { email }: { email: string }) =>
      email === "abby@example.edu" ? { ok: true, user: { id: "UABBY" } } : { ok: false, error: "users_not_found" }
    );

    const result = await runBirthdaySlackPost(MIDNIGHT);

    expect(result).toEqual({ posted: true, count: 2 });
    expect(m.render).toHaveBeenCalledWith("Abby & Otto");
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
    m.findUsers.mockResolvedValue([person("Abby Lane", "abby@example.edu", 11, 7)]);
    m.slackApi.mockResolvedValue({ ok: false, error: "missing_scope" });

    await runBirthdaySlackPost(MIDNIGHT);

    expect(m.upload).toHaveBeenCalledWith(expect.objectContaining({ channel: "CENV", text: "🎂 Happy birthday, Abby! Hope it's a great one." }));
  });

  it("posts nothing when no one has a birthday today", async () => {
    m.findUsers.mockResolvedValue([person("Sage Ruiz", "sage@example.edu", 11, 8)]);
    expect(await runBirthdaySlackPost(MIDNIGHT)).toEqual({ posted: false, reason: "no birthdays" });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("posts nothing when Slack isn't set up", async () => {
    process.env.SLACK_BOT_TOKEN = "";
    expect(await runBirthdaySlackPost(MIDNIGHT)).toEqual({ posted: false, reason: "Slack not configured" });
    expect(m.findUsers).not.toHaveBeenCalled();
  });
});
