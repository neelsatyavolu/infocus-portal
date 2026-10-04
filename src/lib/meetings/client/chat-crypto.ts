import type { MeetingChatCiphertext } from "@/src/lib/meetings/protocol";
import { fromBase64Url, toBase64Url } from "./frame-crypto";

/** Max characters in one chat message (the room caps messages at 64 KB). */
export const MEETING_CHAT_MAX_CHARS = 2000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Who sent a message, where, and which one: bound into the ciphertext as AES-GCM additional data. */
export type ChatContext = { meetingId: string; uid: string; id: string };

/** AAD = UTF-8 of `${meetingId}|${uid}|${epoch}|${id}`. */
export function chatAdditionalData(context: ChatContext, epoch: number) {
  return encoder.encode(`${context.meetingId}|${context.uid}|${epoch}|${context.id}`);
}

/**
 * AES-GCM over UTF-8 JSON {text} with a random 12-byte IV; ct and iv are base64url. The sender's uid
 * (as the room will stamp it), meeting, epoch and message id are authenticated, so a message can't
 * be replayed under another person's name, in another meeting or under another id.
 */
export async function encryptChat(
  chatKey: CryptoKey,
  epoch: number,
  text: string,
  context: ChatContext
): Promise<MeetingChatCiphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = encoder.encode(JSON.stringify({ text: text.slice(0, MEETING_CHAT_MAX_CHARS) }));
  const additionalData = chatAdditionalData(context, epoch);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, chatKey, body));
  return { ct: toBase64Url(ct), iv: toBase64Url(iv), epoch };
}

/**
 * Returns the text, or null when the key is wrong, the message is malformed, or it doesn't match
 * the room-stamped sender/meeting/epoch/id in `context`.
 */
export async function decryptChat(chatKey: CryptoKey, message: MeetingChatCiphertext, context: ChatContext) {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(message.iv), additionalData: chatAdditionalData(context, message.epoch) },
      chatKey,
      fromBase64Url(message.ct)
    );
    const parsed = JSON.parse(decoder.decode(plain)) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text.slice(0, MEETING_CHAT_MAX_CHARS) : null;
  } catch {
    return null;
  }
}
