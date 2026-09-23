import {
  slackApi,
  slackBotToken,
  SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT
} from "@/src/lib/slack-api";
import {
  serializeSlackAnnouncement,
  type SlackAnnouncementItem
} from "@/src/lib/slack-announcements";
import { ensureSlackChannelJoined, loadSlackChannelHistory } from "@/src/server/slack-history";

type SlackUserInfo = {
  ok?: boolean;
  user?: {
    id?: string;
    name?: string;
    real_name?: string;
    profile?: {
      display_name?: string;
      real_name?: string;
      image_48?: string;
      image_72?: string;
    };
  };
};

let announcementCache: {
  at: number;
  configured: boolean;
  items: SlackAnnouncementItem[];
  error: string | null;
} | null = null;

const ANNOUNCEMENT_CACHE_MS = 20_000;

function displayName(user: NonNullable<SlackUserInfo["user"]>) {
  const profile = user.profile;
  return (
    profile?.display_name?.trim() ||
    profile?.real_name?.trim() ||
    user.real_name?.trim() ||
    user.name?.trim() ||
    "Member"
  );
}

async function loadUsers(token: string, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (userId) => {
      const result = (await slackApi("users.info", token, { user: userId })) as SlackUserInfo;
      if (!result.ok || !result.user) return null;
      return [
        userId,
        {
          name: displayName(result.user),
          imageUrl: result.user.profile?.image_72 ?? result.user.profile?.image_48 ?? null
        }
      ] as const;
    })
  );
  return Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}

export async function loadSlackAnnouncements(options?: { refresh?: boolean }): Promise<{
  configured: boolean;
  items: SlackAnnouncementItem[];
  error: string | null;
}> {
  if (
    !options?.refresh &&
    announcementCache &&
    Date.now() - announcementCache.at < ANNOUNCEMENT_CACHE_MS
  ) {
    return announcementCache;
  }

  const token = slackBotToken();
  const channel = process.env.SLACK_ANNOUNCEMENTS_CHANNEL?.trim() || SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT;
  if (!token) {
    const empty = { configured: false, items: [], error: null, at: Date.now() };
    announcementCache = empty;
    return empty;
  }

  try {
    await ensureSlackChannelJoined(token, channel);
    const history = await loadSlackChannelHistory(token, channel);
    if (!history.ok) {
      console.error("slack announcements history failed", history.error);
      const failed = {
        configured: true,
        items: announcementCache?.items ?? [],
        error: "Could not load Slack announcements.",
        at: Date.now()
      };
      announcementCache = failed;
      return failed;
    }

    const raw = history.messages;
    const userIds = raw.map((message) => message.user).filter((id): id is string => Boolean(id));
    const users = await loadUsers(token, userIds);
    const items = raw
      .map((message) => serializeSlackAnnouncement(message, channel, users))
      .filter((item): item is SlackAnnouncementItem => Boolean(item));

    const next = { configured: true, items, error: null, at: Date.now() };
    announcementCache = next;
    return next;
  } catch (error) {
    console.error("slack announcements load failed", error);
    const failed = {
      configured: true,
      items: announcementCache?.items ?? [],
      error: "Could not load Slack announcements.",
      at: Date.now()
    };
    announcementCache = failed;
    return failed;
  }
}
