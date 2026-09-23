import { untitledTopic } from "@/src/lib/package-stage-events";
import { userDisplayName } from "@/src/lib/user-display";
import {
  slackApi,
  slackApiJson,
  slackHubIconUrl,
  SLACK_HUB_BOT_NAME,
  SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT
} from "@/src/lib/slack-api";

const SLACK_API = "https://slack.com/api/chat.postMessage";
const DEFAULT_CHANNEL = SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT;

export type ProofOfContactSlackRow = {
  id?: string;
  cycleNumber: number;
  groupTopic: string;
  members: Array<{ user: { name: string | null; nickname?: string | null; email: string | null } }>;
};

export type SlackProofImage = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type SlackProofOfContactEnv = {
  SLACK_BOT_TOKEN?: string;
  SLACK_PROOF_OF_CONTACT_CHANNEL?: string;
  SLACK_PROOF_OF_CONTACT_WEBHOOK_URL?: string;
  [key: string]: string | undefined;
};

export function proofOfContactSlackText(input: {
  members: Array<{ name: string | null; nickname?: string | null; email: string | null }>;
  topic: string;
  cycleNumber: number;
}) {
  const names = input.members
    .map((member) => userDisplayName(member) || "")
    .filter(Boolean)
    .join(", ");
  return [names, untitledTopic(input.topic), `Cycle #${input.cycleNumber}`, "Proof of Contact"]
    .filter((part) => part.length > 0)
    .join(" - ");
}

export function proofOfContactSlackMarker(topic: string, cycleNumber: number) {
  return `${untitledTopic(topic)} - Cycle #${cycleNumber} - Proof of Contact`;
}

export function slackHasProofOfContactPost(channelTexts: string[], topic: string, cycleNumber: number) {
  const marker = proofOfContactSlackMarker(topic, cycleNumber).toLowerCase();
  return channelTexts.some((text) => text.toLowerCase().includes(marker));
}

export const PROOF_SLACK_SYNC_GRACE_MS = 90_000;

export function proofSlackCatchUpReady(updatedAt: Date, now = Date.now()) {
  return now - updatedAt.getTime() >= PROOF_SLACK_SYNC_GRACE_MS;
}

export type SlackProofHistoryMessage = {
  ts?: string;
  bot_id?: string;
  text?: string;
  files?: unknown[];
};

export function slackProofPostsToDelete(
  messages: SlackProofHistoryMessage[],
  topic: string,
  cycleNumber: number
) {
  const matches = messages.filter(
    (message) =>
      Boolean(message.bot_id) &&
      Boolean(message.ts) &&
      slackHasProofOfContactPost([message.text ?? ""], topic, cycleNumber)
  );
  if (matches.length <= 1) return [];

  const withFiles = matches.filter((message) => (message.files?.length ?? 0) > 0);
  const ranked = (withFiles.length > 0 ? withFiles : matches)
    .slice()
    .sort((left, right) => Number(right.ts) - Number(left.ts));
  const keepTs = ranked[0]?.ts;
  return matches.filter((message) => message.ts !== keepTs).map((message) => message.ts as string);
}

export function proofImagesFromRecords(
  proofs: Array<{ fileName: string; mimeType: string; imageBase64: string }>
): SlackProofImage[] {
  return proofs.flatMap((proof) => {
    if (!proof.imageBase64) return [];
    const bytes = Buffer.from(proof.imageBase64, "base64");
    if (bytes.byteLength === 0) return [];
    return [
      {
        fileName: proof.fileName.trim() || "proof.jpg",
        mimeType: proof.mimeType.trim() || "image/jpeg",
        bytes
      }
    ];
  });
}

export function slackProofOfContactConfig(env: SlackProofOfContactEnv = process.env) {
  const webhookUrl = env.SLACK_PROOF_OF_CONTACT_WEBHOOK_URL?.trim() ?? "";
  if (webhookUrl) {
    try {
      const parsed = new URL(webhookUrl);
      if (parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com") {
        return { mode: "webhook" as const, webhookUrl };
      }
    } catch {
      // fall through to bot token
    }
  }

  const token = env.SLACK_BOT_TOKEN?.trim() ?? "";
  if (!token) return null;
  return {
    mode: "bot" as const,
    token,
    channel: env.SLACK_PROOF_OF_CONTACT_CHANNEL?.trim() || DEFAULT_CHANNEL
  };
}

async function postProofOfContactSlackText(
  config: { token: string; channel: string },
  text: string
) {
  return fetch(SLACK_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      channel: config.channel,
      text,
      username: SLACK_HUB_BOT_NAME,
      icon_url: slackHubIconUrl()
    })
  });
}

async function uploadProofImagesToSlack(
  token: string,
  channel: string,
  text: string,
  images: SlackProofImage[],
  beforeShare?: () => Promise<void>
) {
  const uploaded: Array<{ id: string; title: string }> = [];
  for (const image of images) {
    const ready = await slackApi("files.getUploadURLExternal", token, {
      filename: image.fileName,
      length: String(image.bytes.byteLength)
    });
    const uploadUrl = typeof ready.upload_url === "string" ? ready.upload_url : "";
    const fileId = typeof ready.file_id === "string" ? ready.file_id : "";
    if (!ready.ok || !uploadUrl || !fileId) {
      console.error("slack proof image url failed", ready.error);
      continue;
    }
    const uploadedFile = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": image.mimeType || "application/octet-stream" },
      body: Buffer.from(image.bytes)
    });
    if (!uploadedFile.ok) {
      console.error("slack proof image upload failed", uploadedFile.status);
      continue;
    }
    uploaded.push({ id: fileId, title: image.fileName });
  }
  if (uploaded.length === 0) return { ok: false as const };

  await beforeShare?.();
  const done = await slackApiJson("files.completeUploadExternal", token, {
    files: uploaded,
    channel_id: channel,
    initial_comment: text
  });
  if (!done.ok) {
    console.error("slack proof image share failed", done.error);
    return { ok: false as const };
  }
  return { ok: true as const };
}

export async function postProofOfContactSlack(
  text: string,
  env: SlackProofOfContactEnv = process.env,
  images: SlackProofImage[] = [],
  beforeShare?: () => Promise<void>
) {
  const config = slackProofOfContactConfig(env);
  if (!config) return { skipped: true as const };

  if (config.mode === "bot" && images.length > 0) {
    const uploaded = await uploadProofImagesToSlack(
      config.token,
      config.channel,
      text,
      images,
      beforeShare
    );
    if (uploaded.ok) return { skipped: false as const, ok: true as const };
  }

  const response =
    config.mode === "webhook"
      ? await fetch(config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ text })
        })
      : await postProofOfContactSlackText(config, text);

  const bodyText = await response.text();
  if (!response.ok) {
    console.error("slack proof-of-contact post failed", response.status, bodyText);
    return { skipped: false as const, ok: false as const };
  }

  if (config.mode === "bot") {
    try {
      const body = JSON.parse(bodyText) as { ok?: boolean; error?: string };
      if (!body.ok) {
        console.error("slack proof-of-contact post failed", body.error ?? bodyText);
        return { skipped: false as const, ok: false as const };
      }
    } catch {
      console.error("slack proof-of-contact post failed", bodyText);
      return { skipped: false as const, ok: false as const };
    }
  }

  return { skipped: false as const, ok: true as const };
}

export async function notifyProofOfContactUploaded(
  row: ProofOfContactSlackRow,
  env: SlackProofOfContactEnv = process.env
) {
  return postProofOfContactSlack(
    proofOfContactSlackText({
      members: row.members.map((member) => member.user),
      topic: row.groupTopic,
      cycleNumber: row.cycleNumber
    }),
    env
  );
}
