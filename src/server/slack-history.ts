import { slackApi } from "@/src/lib/slack-api";
import type { SlackHistoryMessage } from "@/src/lib/slack-announcements";

type SlackHistoryResponse = {
  ok?: boolean;
  error?: string;
  messages?: SlackHistoryMessage[];
  response_metadata?: { next_cursor?: string };
};

export async function loadSlackChannelHistory(token: string, channel: string, max = 1000) {
  const messages: SlackHistoryMessage[] = [];
  let cursor = "";

  while (messages.length < max) {
    const payload: Record<string, string> = {
      channel,
      limit: String(Math.min(200, max - messages.length))
    };
    if (cursor) payload.cursor = cursor;

    const result = (await slackApi("conversations.history", token, payload)) as SlackHistoryResponse;
    if (!result.ok) {
      return { ok: false as const, error: result.error ?? "history_failed", messages };
    }

    const batch = result.messages ?? [];
    messages.push(...batch);
    const next = result.response_metadata?.next_cursor?.trim() ?? "";
    if (!next || batch.length === 0) {
      return { ok: true as const, error: null, messages };
    }
    cursor = next;
  }

  return { ok: true as const, error: null, messages };
}

export async function ensureSlackChannelJoined(token: string, channel: string) {
  const joined = await slackApi("conversations.join", token, { channel });
  if (!joined.ok && joined.error && joined.error !== "already_in_channel" && joined.error !== "method_not_supported_for_channel_type") {
    console.error("slack join failed", channel, joined.error);
  }
}
