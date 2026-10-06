import { beforeEach, describe, expect, it, vi } from "vitest";

const slack = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/src/lib/slack-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/slack-api")>(),
  slackApi: slack.api,
  slackBotToken: () => "test-token"
}));
import { loadSlackAnnouncements, loadSlackHistoryJoiningIfNeeded } from "@/src/server/slack-announcements";

const calls = (method: string) => slack.api.mock.calls.filter(([name]) => name === method).length;

beforeEach(() => {
  slack.api.mockReset();
});

describe("Slack announcements loading", () => {
  it("joins the channel only when history says the bot is not in it", async () => {
    let joined = false;
    slack.api.mockImplementation(async (method: string) => {
      if (method === "conversations.join") {
        joined = true;
        return { ok: true };
      }
      return joined ? { ok: true, messages: [] } : { ok: false, error: "not_in_channel" };
    });
    const history = await loadSlackHistoryJoiningIfNeeded("test-token", "C1");
    expect(history.ok).toBe(true);
    expect(calls("conversations.join")).toBe(1);
    expect(calls("conversations.history")).toBe(2);

    slack.api.mockClear();
    await loadSlackHistoryJoiningIfNeeded("test-token", "C1");
    expect(calls("conversations.join")).toBe(0);
  });

  it("reuses users.info results across refreshes", async () => {
    slack.api.mockImplementation(async (method: string) => {
      if (method === "conversations.history") {
        return { ok: true, messages: [{ ts: "1.0", user: "U1", text: "Show today" }] };
      }
      if (method === "users.info") {
        return { ok: true, user: { id: "U1", profile: { display_name: "Sage" } } };
      }
      return { ok: true };
    });
    await loadSlackAnnouncements({ refresh: true });
    await loadSlackAnnouncements({ refresh: true });
    expect(calls("users.info")).toBe(1);
    expect(calls("conversations.join")).toBe(0);
  });
});
