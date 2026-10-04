/**
 * Link previews for meeting links (iMessage, Slack, Discord, WhatsApp, LinkedIn, Telegram, X).
 * Their crawlers fetch the link without signing in, so middleware rewrites `/meet/<id>` for them
 * to the public `/meet-preview/<id>`, which serves metadata only. Edge-safe (middleware imports it).
 */

/** iMessage sends "facebookexternalhit … Facebot Twitterbot"; the rest are the apps' own crawlers. */
const PREVIEW_BOT_UA =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot-LinkExpanding|Discordbot|WhatsApp|LinkedInBot|TelegramBot/i;

const MEET_PATH = /^\/meet\/([^/]+)$/;

export function isLinkPreviewBot(userAgent: string | null | undefined) {
  return Boolean(userAgent && PREVIEW_BOT_UA.test(userAgent));
}

/** Where a preview crawler's GET of a meeting link is served from; null for everyone and everything else. */
export function meetingPreviewRewritePath(pathname: string, method: string, userAgent: string | null | undefined) {
  if (method !== "GET" && method !== "HEAD") return null;
  const id = MEET_PATH.exec(pathname)?.[1];
  if (!id || !isLinkPreviewBot(userAgent)) return null;
  return `/meet-preview/${id}`;
}

/** The preview page and its generated image (path, plus Next's optional hash suffix) are public. */
export const MEETING_PREVIEW_PUBLIC_PATH = /^\/meet-preview\/[^/]+(?:\/opengraph-image(?:-[\w-]+)?)?$/;
