import {
  postProofOfContactSlack,
  proofImagesFromRecords,
  proofOfContactSlackText,
  slackHasProofOfContactPost,
  slackProofPostsToDelete,
  type ProofOfContactSlackRow
} from "@/src/lib/proof-of-contact-slack";
import { slackApi, slackBotToken, SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT } from "@/src/lib/slack-api";
import { prisma } from "@/src/lib/prisma";
import { ensureSlackChannelJoined, loadSlackChannelHistory } from "@/src/server/slack-history";

async function deleteProofPosts(timestamps: string[]) {
  const token = slackBotToken();
  if (!token || timestamps.length === 0) return;
  const channel = process.env.SLACK_PROOF_OF_CONTACT_CHANNEL?.trim() || SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT;
  for (const ts of timestamps) {
    const deleted = await slackApi("chat.delete", token, { channel, ts });
    if (!deleted.ok) {
      console.error("slack proof-of-contact delete failed", deleted.error);
    }
  }
}

async function loadProofChannelHistory() {
  const token = slackBotToken();
  if (!token) return null;
  const channel = process.env.SLACK_PROOF_OF_CONTACT_CHANNEL?.trim() || SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT;
  await ensureSlackChannelJoined(token, channel);
  const history = await loadSlackChannelHistory(token, channel);
  if (!history.ok) return null;
  return history.messages;
}

async function replaceExistingProofPosts(topic: string, cycleNumber: number) {
  const messages = await loadProofChannelHistory();
  if (!messages) return;
  const timestamps = messages
    .filter(
      (message) =>
        Boolean(message.bot_id) &&
        Boolean(message.ts) &&
        slackHasProofOfContactPost([message.text ?? ""], topic, cycleNumber)
    )
    .map((message) => message.ts as string);
  await deleteProofPosts(timestamps);
}

async function collapseDuplicateProofPosts(topic: string, cycleNumber: number) {
  const messages = await loadProofChannelHistory();
  if (!messages) return;
  await deleteProofPosts(slackProofPostsToDelete(messages, topic, cycleNumber));
}

export async function publishProofOfContactToSlack(row: ProofOfContactSlackRow) {
  const text = proofOfContactSlackText({
    members: row.members.map((member) => member.user),
    topic: row.groupTopic,
    cycleNumber: row.cycleNumber
  });
  if (!row.id) {
    return postProofOfContactSlack(text);
  }

  const proofs = await prisma.packageProofOfContact.findMany({
    where: { rowId: row.id },
    orderBy: { slot: "asc" },
    select: { fileName: true, mimeType: true, imageBase64: true }
  });

  const images = proofImagesFromRecords(proofs);
  if (images.length === 0) {
    await replaceExistingProofPosts(row.groupTopic, row.cycleNumber);
  }
  const posted = await postProofOfContactSlack(text, process.env, images, () =>
    replaceExistingProofPosts(row.groupTopic, row.cycleNumber)
  );
  await collapseDuplicateProofPosts(row.groupTopic, row.cycleNumber);
  return posted;
}
