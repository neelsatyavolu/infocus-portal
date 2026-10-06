import { proofSlackCatchUpReady, slackHasProofOfContactPost } from "@/src/lib/proof-of-contact-slack";
import { slackBotToken, SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { prisma } from "@/src/lib/prisma";
import { loadSlackAnnouncements, loadSlackHistoryJoiningIfNeeded } from "@/src/server/slack-announcements";
import { publishProofOfContactToSlack } from "@/src/server/proof-of-contact-slack";

const SYNC_COOLDOWN_MS = 60_000;
const MAX_PROOF_POSTS_PER_SYNC = 40;

let inflight: Promise<{
  configured: boolean;
  proofPosted: number;
  announcementCount: number;
}> | null = null;
let lastRunAt = 0;
let lastResult: {
  configured: boolean;
  proofPosted: number;
  announcementCount: number;
} | null = null;

async function syncMissingProofOfContactPosts() {
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

  const needsPost = rows.filter((row) => {
    const latestProof = row.proofOfContacts.reduce(
      (latest, proof) => (proof.updatedAt > latest ? proof.updatedAt : latest),
      row.proofOfContacts[0]?.updatedAt ?? new Date(0)
    );
    if (!proofSlackCatchUpReady(latestProof)) return false;
    const matches = history.messages.filter((message) =>
      slackHasProofOfContactPost([message.text ?? ""], row.groupTopic, row.cycleNumber)
    );
    return !matches.some((message) => (message.files?.length ?? 0) > 0);
  });
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
    if (posted >= MAX_PROOF_POSTS_PER_SYNC) break;
    const members = membersByRowId.get(row.id);
    if (!members) continue;
    const result = await publishProofOfContactToSlack({ ...row, members });
    if (result.ok) posted += 1;
  }
  return posted;
}

async function runSlackSync() {
  const token = slackBotToken();
  if (!token) {
    return { configured: false, proofPosted: 0, announcementCount: 0 };
  }

  const announcements = await loadSlackAnnouncements({ refresh: true });
  const proofPosted = await syncMissingProofOfContactPosts();
  return {
    configured: true,
    proofPosted,
    announcementCount: announcements.items.length
  };
}

export async function syncSlackOnStart() {
  if (inflight) return inflight;
  if (lastResult && Date.now() - lastRunAt < SYNC_COOLDOWN_MS) {
    return lastResult;
  }

  inflight = runSlackSync()
    .then((result) => {
      lastResult = result;
      lastRunAt = Date.now();
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
