import { proofSlackCatchUpReady, slackHasProofOfContactPost } from "@/src/lib/proof-of-contact-slack";
import { slackBotToken, SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { prisma } from "@/src/lib/prisma";
import { loadSlackAnnouncements, loadSlackHistoryJoiningIfNeeded } from "@/src/server/slack-announcements";
import { publishProofOfContactToSlack } from "@/src/server/proof-of-contact-slack";

const SYNC_COOLDOWN_MS = 60_000;
/** Each post uploads an image to Slack; a few per sync keeps the request well inside 30 s. */
const MAX_PROOF_POSTS_PER_SYNC = 5;
/** Stop starting new posts after this long; the next sync picks up the rest. */
const PROOF_POST_BUDGET_MS = 15_000;
/** Shared across Worker isolates (RateLimitBucket row), so only one sync runs per cooldown. */
const SYNC_LOCK_KEY = "slack-sync";

export type SlackSyncResult = {
  configured: boolean;
  proofPosted: number;
  announcementCount: number;
  skipped?: boolean;
};

/**
 * Claims the next sync slot for every isolate: true when this request should run the sync.
 * Holds no state in module scope, so nothing from one request's PrismaClient leaks into another.
 */
export async function claimSlackSyncSlot(now = new Date()) {
  const resetAt = new Date(now.getTime() + SYNC_COOLDOWN_MS);
  const claimed = await prisma.rateLimitBucket.updateMany({
    where: { key: SYNC_LOCK_KEY, resetAt: { lte: now } },
    data: { resetAt, count: 1 }
  });
  if (claimed.count > 0) return true;
  try {
    await prisma.rateLimitBucket.create({ data: { key: SYNC_LOCK_KEY, count: 1, resetAt } });
    return true;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") return false;
    throw error;
  }
}

async function syncMissingProofOfContactPosts() {
  const startedAt = Date.now();
  const token = slackBotToken();
  if (!token) return 0;

  const channel = process.env.SLACK_PROOF_OF_CONTACT_CHANNEL?.trim() || SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT;
  const history = await loadSlackHistoryJoiningIfNeeded(token, channel);
  if (!history.ok) {
    console.error("slack proof-of-contact history failed", history.error);
    return 0;
  }
  const rows = await prisma.packageProgressRow.findMany({
    where: { proofOfContacts: { some: {} } },
    select: {
      id: true,
      cycleNumber: true,
      groupTopic: true,
      proofOfContacts: { select: { updatedAt: true } }
    }
  });

  const needsPost = rows
    .filter((row) => {
      const latestProof = row.proofOfContacts.reduce(
        (latest, proof) => (proof.updatedAt > latest ? proof.updatedAt : latest),
        row.proofOfContacts[0]?.updatedAt ?? new Date(0)
      );
      if (!proofSlackCatchUpReady(latestProof)) return false;
      const matches = history.messages.filter((message) =>
        slackHasProofOfContactPost([message.text ?? ""], row.groupTopic, row.cycleNumber)
      );
      return !matches.some((message) => (message.files?.length ?? 0) > 0);
    })
    .slice(0, MAX_PROOF_POSTS_PER_SYNC);
  if (needsPost.length === 0) return 0;

  // Member names are only needed for the packages that still need a post (usually none).
  const membersByRowId = new Map(
    (
      await prisma.packageProgressRow.findMany({
        where: { id: { in: needsPost.map((row) => row.id) } },
        select: {
          id: true,
          members: {
            select: {
              user: { select: { name: true, nickname: true, email: true } }
            }
          }
        }
      })
    ).map((row) => [row.id, row.members] as const)
  );

  let posted = 0;
  for (const row of needsPost) {
    if (Date.now() - startedAt > PROOF_POST_BUDGET_MS) break;
    const members = membersByRowId.get(row.id);
    if (!members) continue;
    const result = await publishProofOfContactToSlack({ ...row, members });
    if (result.ok) posted += 1;
  }
  return posted;
}

export async function syncSlackOnStart(): Promise<SlackSyncResult> {
  const token = slackBotToken();
  if (!token) {
    return { configured: false, proofPosted: 0, announcementCount: 0 };
  }
  if (!(await claimSlackSyncSlot())) {
    return { configured: true, proofPosted: 0, announcementCount: 0, skipped: true };
  }

  const announcements = await loadSlackAnnouncements({ refresh: true });
  const proofPosted = await syncMissingProofOfContactPosts();
  return {
    configured: true,
    proofPosted,
    announcementCount: announcements.items.length
  };
}
