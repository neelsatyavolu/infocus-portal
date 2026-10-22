import { prisma } from "@/src/lib/prisma";

export const PAST_CARDS_MAX = 16;
const CARD_TITLE_MAX = 120;
const CARD_POINTS_MAX = 6;
const CARD_POINT_MAX = 160;
const CARD_SCRIPT_MAX = 1500;
/** Recent finished edits looked at; plenty to fill 16 cards, even with one edit per show. */
const PAST_JOBS_SCANNED = 40;

/** One announcement card of an edit (`checks.cards`); `script` is the announcement text it was made from. */
export type ShowEditCard = { title: string; points: string[]; script: string | null };
export type PastShowCard = ShowEditCard & { showDate: string };

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** `checks.cards` read back: strings only, cut to length; a card without a title is dropped. */
export function cardsOf(checks: unknown): ShowEditCard[] {
  const cards = checks && typeof checks === "object" && !Array.isArray(checks) ? (checks as { cards?: unknown }).cards : null;
  if (!Array.isArray(cards)) return [];
  return cards.flatMap((card) => {
    if (!card || typeof card !== "object") return [];
    const { title, points, script } = card as Record<string, unknown>;
    const cleanTitle = cleanText(title, CARD_TITLE_MAX);
    if (!cleanTitle) return [];
    const cleanPoints = Array.isArray(points)
      ? points.map((point) => cleanText(point, CARD_POINT_MAX)).filter(Boolean).slice(0, CARD_POINTS_MAX)
      : [];
    return [{ title: cleanTitle, points: cleanPoints, script: cleanText(script, CARD_SCRIPT_MAX) || null }];
  });
}

/**
 * The brief's `pastCards`: cards from other shows' finished edits (REVIEW or PUBLISHED), newest show first,
 * one edit per show (its latest), at most 16 cards in all.
 */
export async function pastShowCards(showDate: string): Promise<PastShowCard[]> {
  const jobs = await prisma.showEditJob.findMany({
    where: { status: { in: ["REVIEW", "PUBLISHED"] }, showDate: { not: showDate } },
    orderBy: [{ showDate: "desc" }, { createdAt: "desc" }],
    select: { showDate: true, checks: true },
    take: PAST_JOBS_SCANNED
  });
  const seen = new Set<string>();
  const cards: PastShowCard[] = [];
  for (const job of jobs) {
    if (seen.has(job.showDate)) continue;
    seen.add(job.showDate);
    for (const card of cardsOf(job.checks)) {
      if (cards.length >= PAST_CARDS_MAX) return cards;
      cards.push({ showDate: job.showDate, ...card });
    }
  }
  return cards;
}
