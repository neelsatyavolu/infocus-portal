import { XMLParser } from "fast-xml-parser";
import { decodeHtmlEntities } from "@/src/lib/news-alerts";

export type IdeaFeedKind = "news" | "events";

export type IdeaFeed = { name: string; url: string; kind: IdeaFeedKind };

/** One headline or event listing, cleaned to plain text. */
export type FeedItem = {
  outlet: string;
  kind: IdeaFeedKind;
  title: string;
  summary: string;
  url: string;
  /** ISO time the outlet published it. */
  publishedAt: string;
};

/**
 * Public RSS 2.0 feeds the Ideas job reads (docs/knowledge/ideas.md). Each one answered a plainly
 * labelled feed-reader request in October 2026; sites that refuse one are left out on purpose.
 * To add or drop a source, edit this list.
 */
export const IDEA_FEEDS: readonly IdeaFeed[] = [
  // Palo Alto and the Peninsula
  { name: "Palo Alto Online", url: "https://www.paloaltoonline.com/feed/", kind: "news" },
  { name: "Palo Alto Daily Post", url: "https://padailypost.com/feed/", kind: "news" },
  { name: "Mountain View Voice", url: "https://www.mv-voice.com/feed/", kind: "news" },
  { name: "The Almanac", url: "https://www.almanacnews.com/feed/", kind: "news" },
  { name: "Redwood City Pulse", url: "https://www.rwcpulse.com/feed/", kind: "news" },
  { name: "InMenlo", url: "https://inmenlo.com/feed/", kind: "news" },
  { name: "The Stanford Daily", url: "https://stanforddaily.com/feed/", kind: "news" },
  // South Bay
  { name: "San José Spotlight", url: "https://sanjosespotlight.com/feed/", kind: "news" },
  { name: "San Jose Inside", url: "https://www.sanjoseinside.com/feed/", kind: "news" },
  // San Francisco
  { name: "SFGate", url: "https://www.sfgate.com/bayarea/feed/Bay-Area-News-429.php", kind: "news" },
  { name: "The San Francisco Standard", url: "https://sfstandard.com/feed/", kind: "news" },
  { name: "Mission Local", url: "https://missionlocal.org/feed/", kind: "news" },
  { name: "SFist", url: "https://sfist.com/rss/", kind: "news" },
  // East Bay
  { name: "Berkeleyside", url: "https://www.berkeleyside.org/feed", kind: "news" },
  { name: "The Oaklandside", url: "https://oaklandside.org/feed/", kind: "news" },
  // Region-wide
  { name: "KQED News", url: "https://ww2.kqed.org/news/feed/", kind: "news" },
  { name: "Local News Matters", url: "https://localnewsmatters.org/feed/", kind: "news" },
  { name: "ABC7 News", url: "https://abc7news.com/feed/", kind: "news" },
  { name: "NBC Bay Area", url: "https://www.nbcbayarea.com/news/local/feed/", kind: "news" },
  { name: "CBS News Bay Area", url: "https://www.cbsnews.com/sanfrancisco/latest/rss/main", kind: "news" },
  { name: "KTVU", url: "https://www.ktvu.com/rss/category/news", kind: "news" },
  { name: "EdSource", url: "https://edsource.org/feed", kind: "news" },
  { name: "Bay Nature", url: "https://baynature.org/feed/", kind: "news" },
  // Events, arts and things to do
  { name: "Funcheap SF", url: "https://sf.funcheap.com/feed/", kind: "events" },
  { name: "KQED Arts", url: "https://ww2.kqed.org/arts/feed/", kind: "events" },
  { name: "7x7", url: "https://www.7x7.com/feeds/feed.rss", kind: "events" },
  { name: "Metro Silicon Valley", url: "https://www.metrosiliconvalley.com/feed/", kind: "events" }
];

const TITLE_MAX = 160;
const SUMMARY_MAX = 220;
// Only the start of a field is ever shown, so only the start is cleaned (some feeds carry whole articles).
const FIELD_SCAN_MAX = 4000;

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Feed text arrives as HTML, sometimes escaped twice. Returns one line of plain text. */
function plainText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  const text = decodeHtmlEntities(value.slice(0, FIELD_SCAN_MAX).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s*The post .+ appeared first on .+$/, "")
    .trim();
  return clip(text, max);
}

function httpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value.trim().replace(/\sUT$/, " GMT"));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Items of an RSS 2.0 document. Anything that is not a feed, or an item missing a part, yields nothing. */
export function parseFeed(xml: string, feed: IdeaFeed): FeedItem[] {
  let rawItems: unknown;
  try {
    rawItems = parser.parse(xml)?.rss?.channel?.item;
  } catch {
    return [];
  }
  const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  return list.flatMap((raw): FeedItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Record<string, unknown>;
    const title = plainText(entry.title, TITLE_MAX);
    const url = httpUrl(entry.link);
    const publishedAt = isoDate(entry.pubDate);
    if (!title || !url || !publishedAt) return [];
    return [{ outlet: feed.name, kind: feed.kind, title, summary: plainText(entry.description, SUMMARY_MAX), url, publishedAt }];
  });
}
