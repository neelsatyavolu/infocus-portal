import { IDEA_FEEDS, parseFeed, type FeedItem, type IdeaFeed } from "@/src/lib/idea-feeds";
import {
  IDEA_MAX_OUTPUT_TOKENS,
  buildIdeaMessages,
  estimateNeurons,
  isIdeaBatchDue,
  parseIdeaResponse,
  parseStoredIdeas,
  selectFeedItems,
  type IdeaSuggestion
} from "@/src/lib/ideas";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { workersAiConfig, workersAiJsonChat } from "@/src/server/workers-ai";

/**
 * Ideas (/ideas): every 2 days, story ideas written by Workers AI from Bay Area news and event
 * feeds. The steps are separate so the job (src/server/ideas-schedule.ts) can retry a failed save
 * without repeating the model call.
 */

// Says who is asking. Feeds that refuse a labelled reader are not in IDEA_FEEDS.
const FEED_USER_AGENT = "InFocusPortal/1.0 (+https://infocuspaly.com; story ideas feed reader)";
const FEED_TIMEOUT_MS = 12_000;
// The largest feed on the list is under 500 KB.
const FEED_MAX_CHARS = 3_000_000;
// Several feeds share a host; a few at a time keeps them from timing out.
const FEEDS_AT_ONCE = 4;
const RUN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type IdeaRunCheck = { due: true; runDate: string } | { due: false; reason: "not_configured" | "not_due" };

export async function checkIdeaRunDue(now = new Date()): Promise<IdeaRunCheck> {
  if (!workersAiConfig()) return { due: false, reason: "not_configured" };
  const latest = await prisma.ideaBatch.findFirst({ orderBy: { runDate: "desc" }, select: { runDate: true } });
  const runDate = pacificDateKey(now);
  return isIdeaBatchDue(latest?.runDate ?? null, runDate) ? { due: true, runDate } : { due: false, reason: "not_due" };
}

async function loadFeed(feed: IdeaFeed): Promise<FeedItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: { "User-Agent": FEED_USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      cache: "no-store",
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    if (xml.length > FEED_MAX_CHARS) throw new Error("response too large");
    return parseFeed(xml, feed);
  } catch (error) {
    console.error(`Ideas: ${feed.name} feed failed`, error instanceof Error ? error.message : error);
    return [];
  }
}

/** The headlines for one run. Never throws: a feed that fails is skipped. */
export async function loadIdeaFeedItems(now = new Date()): Promise<FeedItem[]> {
  const itemsByFeed: FeedItem[][] = [];
  for (let start = 0; start < IDEA_FEEDS.length; start += FEEDS_AT_ONCE) {
    itemsByFeed.push(...(await Promise.all(IDEA_FEEDS.slice(start, start + FEEDS_AT_ONCE).map(loadFeed))));
  }
  return selectFeedItems(itemsByFeed, now);
}

/** The one model call of a run. */
export async function requestIdeas(items: FeedItem[], now = new Date()) {
  const config = workersAiConfig();
  if (!config) throw new Error("Workers AI is not configured.");
  const { system, user } = buildIdeaMessages(items, now);
  const reply = await workersAiJsonChat(config, { system, user, maxTokens: IDEA_MAX_OUTPUT_TOKENS });
  return { ideas: parseIdeaResponse(reply.content, items), inputTokens: reply.inputTokens, outputTokens: reply.outputTokens };
}

export async function storeIdeaBatch(input: {
  runDate: string;
  itemCount: number;
  ideas: IdeaSuggestion[];
  inputTokens: number;
  outputTokens: number;
}) {
  const summary = {
    runDate: input.runDate,
    ideas: input.ideas.length,
    items: input.itemCount,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    neurons: Math.round(estimateNeurons(input.inputTokens, input.outputTokens))
  };
  try {
    await prisma.ideaBatch.create({ data: input });
  } catch (error) {
    // runDate is unique: another run already saved today's batch.
    if ((error as { code?: string }).code === "P2002") return { status: "already_exists" as const, ...summary };
    throw error;
  }
  return { status: "created" as const, ...summary };
}

/** Every batch's date, newest first. */
export async function listIdeaRunDates() {
  const rows = await prisma.ideaBatch.findMany({ orderBy: { runDate: "desc" }, select: { runDate: true }, take: 200 });
  return rows.map((row) => row.runDate);
}

export type IdeaBatchView = { runDate: string; ideas: IdeaSuggestion[]; itemCount: number };

/** The batch for `runDate`, or the newest one. */
export async function getIdeaBatch(runDate?: string): Promise<IdeaBatchView | null> {
  if (runDate !== undefined && !RUN_DATE.test(runDate)) return null;
  const select = { runDate: true, ideas: true, itemCount: true } as const;
  const row = runDate
    ? await prisma.ideaBatch.findUnique({ where: { runDate }, select })
    : await prisma.ideaBatch.findFirst({ orderBy: { runDate: "desc" }, select });
  return row ? { runDate: row.runDate, ideas: parseStoredIdeas(row.ideas), itemCount: row.itemCount } : null;
}
