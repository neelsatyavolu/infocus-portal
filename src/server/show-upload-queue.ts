import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Message body on the infocus-show-uploads queue (consumer: worker.ts). */
export type ShowUploadMessage = { id: string };

type QueueEnv = { SHOW_UPLOADS?: { sendBatch(messages: { body: ShowUploadMessage }[]): Promise<void> } };

/** Queues shows for the upload consumer. Duplicates are harmless: it runs one at a time and skips finished shows. */
export async function enqueueShowUploads(ids: string[]) {
  if (!ids.length) return;
  const queue = (getCloudflareContext().env as QueueEnv).SHOW_UPLOADS;
  if (!queue) throw new Error("SHOW_UPLOADS queue binding is missing");
  await queue.sendBatch(ids.map((id) => ({ body: { id } })));
}
