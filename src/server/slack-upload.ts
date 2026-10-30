import { slackApi, slackApiJson } from "@/src/lib/slack-api";

/** Uploads a file and shares it in `channel` with `text` as the message. */
export async function uploadFileToSlack(input: {
  token: string;
  channel: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  text: string;
}) {
  const { token, channel, fileName, contentType, bytes, text } = input;
  const ready = await slackApi("files.getUploadURLExternal", token, { filename: fileName, length: String(bytes.byteLength) });
  const uploadUrl = typeof ready.upload_url === "string" ? ready.upload_url : "";
  const fileId = typeof ready.file_id === "string" ? ready.file_id : "";
  if (!ready.ok || !uploadUrl || !fileId) throw new Error(`Slack upload URL failed: ${ready.error ?? "unknown"}`);

  const uploaded = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: Buffer.from(bytes) });
  if (!uploaded.ok) throw new Error(`Slack file upload failed: ${uploaded.status}`);

  const done = await slackApiJson("files.completeUploadExternal", token, {
    files: [{ id: fileId, title: fileName }],
    channel_id: channel,
    initial_comment: text
  });
  if (!done.ok) throw new Error(`Slack file share failed: ${done.error ?? "unknown"}`);
}
