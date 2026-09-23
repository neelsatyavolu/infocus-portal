import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyProofOfContactUploaded,
  postProofOfContactSlack,
  proofOfContactSlackText,
  proofSlackCatchUpReady,
  slackHasProofOfContactPost,
  slackProofOfContactConfig,
  slackProofPostsToDelete
} from "@/src/lib/proof-of-contact-slack";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("proof-of-contact Slack copy", () => {
  it("formats member names, package title, and cycle", () => {
    expect(
      proofOfContactSlackText({
        members: [
          { name: "Alex Lee", email: "alex@pausd.us" },
          { name: "Sam Patel", email: "sam@pausd.us" }
        ],
        topic: "Lee-Patel",
        cycleNumber: 1
      })
    ).toBe("Alex Lee, Sam Patel - Lee-Patel - Cycle #1 - Proof of Contact");
  });

  it("prefers nicknames in Slack copy", () => {
    expect(
      proofOfContactSlackText({
        members: [
          { name: "Lucas Hale", nickname: "Lo", email: "lucas@pausd.us" },
          { name: "Abby Chen", nickname: "Abby", email: "abby@pausd.us" }
        ],
        topic: "Hale-Chen",
        cycleNumber: 2
      })
    ).toBe("Lo, Abby - Hale-Chen - Cycle #2 - Proof of Contact");
  });

  it("detects an existing Slack post for a package", () => {
    expect(
      slackHasProofOfContactPost(
        ["Alex Lee, Sam Patel - Lee-Patel - Cycle #1 - Proof of Contact"],
        "Lee-Patel",
        1
      )
    ).toBe(true);
    expect(slackHasProofOfContactPost(["unrelated"], "Lee-Patel", 1)).toBe(false);
  });

  it("keeps the newest file post and deletes older duplicates", () => {
    const caption = "Alex Lee, Sam Patel - Lee-Patel - Cycle #1 - Proof of Contact";
    expect(
      slackProofPostsToDelete(
        [
          { ts: "100.2", bot_id: "B1", text: caption, files: [{ id: "F-old" }] },
          { ts: "100.4", bot_id: "B1", text: caption, files: [{ id: "F-new" }] },
          { ts: "100.3", bot_id: "B1", text: caption, files: [] },
          { ts: "100.5", bot_id: "B1", text: "unrelated" }
        ],
        "Lee-Patel",
        1
      )
    ).toEqual(["100.2", "100.3"]);
  });

  it("skips Slack catch-up while a live upload may still be posting", () => {
    const now = Date.parse("2026-09-01T04:33:47.000Z");
    expect(proofSlackCatchUpReady(new Date("2026-09-01T04:33:25.000Z"), now)).toBe(false);
    expect(proofSlackCatchUpReady(new Date("2026-09-01T04:31:00.000Z"), now)).toBe(true);
  });

  it("falls back to email and untitled topic", () => {
    expect(
      proofOfContactSlackText({
        members: [{ name: "  ", email: "zara@pausd.us" }, { name: null, email: null }],
        topic: "   ",
        cycleNumber: 3
      })
    ).toBe("zara@pausd.us - Untitled package - Cycle #3 - Proof of Contact");
  });
});

describe("proof-of-contact Slack config", () => {
  it("prefers a hooks.slack.com webhook", () => {
    expect(
      slackProofOfContactConfig({
        SLACK_PROOF_OF_CONTACT_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/xxx",
        SLACK_BOT_TOKEN: "xoxb-unused"
      })
    ).toEqual({
      mode: "webhook",
      webhookUrl: "https://hooks.slack.com/services/T/B/xxx"
    });
  });

  it("rejects non-Slack webhook hosts", () => {
    expect(
      slackProofOfContactConfig({
        SLACK_PROOF_OF_CONTACT_WEBHOOK_URL: "https://example.com/hooks"
      })
    ).toBeNull();
  });

  it("uses the bot token and default channel", () => {
    expect(slackProofOfContactConfig({ SLACK_BOT_TOKEN: "xoxb-test" })).toEqual({
      mode: "bot",
      token: "xoxb-test",
      channel: "C0BUG24GYP2"
    });
  });
});

describe("proof-of-contact Slack post", () => {
  it("skips when Slack is not configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(postProofOfContactSlack("hello", {})).resolves.toEqual({ skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts webhook text", async () => {
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      postProofOfContactSlack("Alex Lee - Lee-Patel - Cycle #1 - Proof of Contact", {
        SLACK_PROOF_OF_CONTACT_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/xxx"
      })
    ).resolves.toEqual({ skipped: false, ok: true });
    expect(fetchSpy).toHaveBeenCalledWith("https://hooks.slack.com/services/T/B/xxx", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text: "Alex Lee - Lee-Patel - Cycle #1 - Proof of Contact" })
    });
  });

  it("uploads proof images with the caption", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes("files.getUploadURLExternal")) {
        return new Response(JSON.stringify({ ok: true, upload_url: "https://files.slack.com/upload/x", file_id: "F1" }), {
          status: 200
        });
      }
      if (href.includes("files.slack.com/upload")) {
        return new Response("ok", { status: 200 });
      }
      if (href.includes("files.completeUploadExternal")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false, error: "unexpected" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      postProofOfContactSlack(
        "Alex Lee - Lee-Patel - Cycle #1 - Proof of Contact",
        { SLACK_BOT_TOKEN: "xoxb-test" },
        [{ fileName: "proof-1.jpg", mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }]
      )
    ).resolves.toEqual({ skipped: false, ok: true });
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("files.getUploadURLExternal"))).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("files.completeUploadExternal"))).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("chat.postMessage"))).toBe(false);
  });

  it("posts bot chat.postMessage to proof-of-contact", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      notifyProofOfContactUploaded(
        {
          cycleNumber: 2,
          groupTopic: "Lee-Patel",
          members: [{ user: { name: "Alex Lee", email: "alex@pausd.us" } }]
        },
        { SLACK_BOT_TOKEN: "xoxb-test" }
      )
    ).resolves.toEqual({ skipped: false, ok: true });
    expect(fetchSpy).toHaveBeenCalledWith("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: "Bearer xoxb-test",
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        channel: "C0BUG24GYP2",
        text: "Alex Lee - Lee-Patel - Cycle #2 - Proof of Contact",
        username: "InFocus Portal",
        icon_url: "https://infocuspaly.com/favicon/infocus-hub-icon.png"
      })
    });
  });
});
