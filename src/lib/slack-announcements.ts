import { ANNOUNCEMENT_TIME_ZONE } from "@/src/lib/announcement-submission";

const SKIP_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "bot_add",
  "bot_remove",
  "reminder_add"
]);

export type SlackHistoryFile = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  pretty_type?: string;
  size?: number;
};

export type SlackHistoryMessage = {
  type?: string;
  subtype?: string;
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  username?: string;
  bot_profile?: { name?: string; icon_url?: string };
  files?: SlackHistoryFile[];
};

export type SlackTextPart = { type: "text"; value: string } | { type: "link"; href: string; label: string };

export type SlackFileAttachment = {
  id: string;
  title: string;
  prettyType: string | null;
};

export type SlackAnnouncementItem = {
  id: string;
  ts: string;
  authorName: string;
  authorImageUrl: string | null;
  text: string;
  parts: SlackTextPart[];
  attachments: SlackFileAttachment[];
  postedAt: string;
  dateLabel: string;
  timeLabel: string;
  permalink: string;
};

export function isSlackAnnouncementMessage(message: SlackHistoryMessage) {
  if (message.type && message.type !== "message") return false;
  if (message.subtype && SKIP_SUBTYPES.has(message.subtype)) return false;
  const text = message.text?.trim() ?? "";
  const hasFiles = Boolean(message.files?.length);
  if (!text && !hasFiles) return false;
  if (/^InFocus bot connected to #/i.test(text)) return false;
  return true;
}

export function decodeSlackEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n");
}

export function isSafeHttpUrl(href: string) {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function pushTextParts(parts: SlackTextPart[], value: string) {
  const urlSplit = /(https?:\/\/[^\s<]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = urlSplit.exec(value))) {
    if (match.index > last) {
      parts.push({ type: "text", value: value.slice(last, match.index) });
    }
    let href = match[1];
    let trailing = "";
    while (/[.,;:!]$/.test(href)) {
      trailing = href.slice(-1) + trailing;
      href = href.slice(0, -1);
    }
    if (isSafeHttpUrl(href)) {
      parts.push({ type: "link", href, label: href });
    } else {
      parts.push({ type: "text", value: match[1] });
      trailing = "";
    }
    if (trailing) parts.push({ type: "text", value: trailing });
    last = match.index + match[0].length;
  }
  if (last < value.length) {
    parts.push({ type: "text", value: value.slice(last) });
  }
}

export function slackMrkdwnParts(text: string, users: Record<string, string> = {}): SlackTextPart[] {
  const parts: SlackTextPart[] = [];
  const token =
    /<!channel>|<!here>|<!everyone>|<@([A-Z0-9]+)(?:\|([^>]+))?>|<#(?:[A-Z0-9]+)\|([^>]+)>|<((?:https?:\/\/|mailto:)[^|>]+)(?:\|([^>]+))?>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    if (match.index > last) {
      pushTextParts(parts, decodeSlackEntities(text.slice(last, match.index)));
    }
    const raw = match[0];
    if (raw === "<!channel>") {
      parts.push({ type: "text", value: "@channel" });
    } else if (raw === "<!here>") {
      parts.push({ type: "text", value: "@here" });
    } else if (raw === "<!everyone>") {
      parts.push({ type: "text", value: "@everyone" });
    } else if (raw.startsWith("<@")) {
      const name = match[2]?.trim() || users[match[1]];
      parts.push({ type: "text", value: name ? `@${name}` : "@member" });
    } else if (raw.startsWith("<#")) {
      parts.push({ type: "text", value: `#${match[3]}` });
    } else {
      const href = match[4];
      const label = decodeSlackEntities(match[5]?.trim() || href);
      if (isSafeHttpUrl(href) || href.startsWith("mailto:")) {
        parts.push({ type: "link", href, label });
      } else {
        parts.push({ type: "text", value: label });
      }
    }
    last = match.index + raw.length;
  }
  if (last < text.length) {
    pushTextParts(parts, decodeSlackEntities(text.slice(last)));
  }
  return parts.filter((part) => part.type === "link" || part.value.length > 0);
}

export function slackMrkdwnToPlain(text: string, users: Record<string, string> = {}) {
  return slackMrkdwnParts(text, users)
    .map((part) => (part.type === "link" ? part.label : part.value))
    .join("")
    .trim();
}

export function slackFileAttachments(files: SlackHistoryFile[] | undefined): SlackFileAttachment[] {
  return (files ?? []).flatMap((file) => {
    const id = file.id?.trim();
    if (!id) return [];
    const title = decodeSlackEntities(file.name?.trim() || file.title?.trim() || "Attachment");
    return [{ id, title, prettyType: file.pretty_type ?? null }];
  });
}

export function slackPermalink(channelId: string, ts: string) {
  return `https://infocusnews.slack.com/archives/${channelId}/p${ts.replace(".", "")}`;
}

export function formatSlackTimestamp(ts: string, timeZone = ANNOUNCEMENT_TIME_ZONE) {
  const date = new Date(Number.parseFloat(ts) * 1000);
  return {
    postedAt: date.toISOString(),
    dateLabel: date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone
    }),
    timeLabel: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone
    })
  };
}

export function groupSlackAnnouncements(items: SlackAnnouncementItem[]) {
  const groups: Array<{ dateLabel: string; items: SlackAnnouncementItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === item.dateLabel) {
      last.items.push(item);
    } else {
      groups.push({ dateLabel: item.dateLabel, items: [item] });
    }
  }
  return groups;
}

export function serializeSlackAnnouncement(
  message: SlackHistoryMessage,
  channelId: string,
  users: Record<string, { name: string; imageUrl: string | null }>
): SlackAnnouncementItem | null {
  if (!isSlackAnnouncementMessage(message)) return null;
  const user = message.user ? users[message.user] : undefined;
  const authorName =
    user?.name ||
    message.username?.trim() ||
    message.bot_profile?.name?.trim() ||
    "InFocus";
  const nameMap = Object.fromEntries(Object.entries(users).map(([id, profile]) => [id, profile.name]));
  const parts = slackMrkdwnParts(message.text ?? "", nameMap);
  const attachments = slackFileAttachments(message.files);
  const text = parts
    .map((part) => (part.type === "link" ? part.label : part.value))
    .join("")
    .trim();
  if (!text && attachments.length === 0) return null;
  const stamped = formatSlackTimestamp(message.ts);
  return {
    id: message.ts,
    ts: message.ts,
    authorName,
    authorImageUrl: user?.imageUrl ?? message.bot_profile?.icon_url ?? null,
    text,
    parts,
    attachments,
    permalink: slackPermalink(channelId, message.ts),
    ...stamped
  };
}
