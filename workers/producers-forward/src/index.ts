import PostalMime, { type Email as ParsedEmail } from "postal-mime";
import { Client } from "pg";

/**
 * producers@ (Cloudflare Email Routing → this Worker): sends each message on to the Portal's
 * executive producers and super admins, read from the Portal's database when the mail arrives.
 * Resend delivers it as "<sender> via InFocus Producers", with Reply-To set to the sender.
 * If that can't happen, the message is forwarded to FALLBACK_DESTINATIONS instead, so nothing
 * is lost.
 */
export interface Env {
  HYPERDRIVE: Hyperdrive;
  RESEND_API_KEY: string;
  /** The list's own address and name, e.g. producers@infocusportal.com / InFocus Producers. */
  LIST_ADDRESS: string;
  LIST_NAME: string;
  /** Same as the Portal's: a super admin with no PlatformRoleAssignment row. */
  PLATFORM_SUPER_ADMIN_EMAIL?: string;
  /** Comma-separated, verified Email Routing destinations for when the database or Resend fails. */
  FALLBACK_DESTINATIONS?: string;
}

/** Marks mail this Worker sent, so a reply-all to the list can't loop through it twice. */
export const FORWARDED_HEADER = "X-InFocus-Producers";

/** Executive producers and super admins who still have a Portal account. */
export const RECIPIENTS_SQL = `SELECT DISTINCT lower(r.email) AS email
FROM "PlatformRoleAssignment" r
JOIN "User" u ON lower(u.email) = lower(r.email)
WHERE r.role IN ('EXECUTIVE_PRODUCER', 'SUPER_ADMIN')`;

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/** Deduplicated, lowercased, valid addresses, never the list itself. */
export function recipientList(emails: readonly (string | null | undefined)[], listAddress: string): string[] {
  const list = listAddress.trim().toLowerCase();
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = (raw ?? "").trim().toLowerCase();
    if (EMAIL.test(email) && email !== list) seen.add(email);
  }
  return [...seen].sort();
}

async function loadRecipients(env: Env): Promise<string[]> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ email: string }>(RECIPIENTS_SQL);
    return recipientList([...rows.map((row) => row.email), env.PLATFORM_SUPER_ADMIN_EMAIL], env.LIST_ADDRESS);
  } finally {
    await client.end();
  }
}

/** A display name safe inside "Name via List <address>". */
function displayName(raw: string) {
  return raw.replace(/["<>\r\n]/g, "").trim().slice(0, 80);
}

function toBase64(content: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The Resend request for one parsed message. `envelopeFrom` covers mail with no From header. */
export function resendPayload(parsed: ParsedEmail, recipients: readonly string[], env: Pick<Env, "LIST_ADDRESS" | "LIST_NAME">, envelopeFrom: string) {
  const senderAddress = (parsed.from?.address || envelopeFrom).trim();
  const sender = displayName(parsed.from?.name || senderAddress);
  return {
    from: `${sender} via ${env.LIST_NAME} <${env.LIST_ADDRESS}>`,
    to: [...recipients],
    reply_to: [senderAddress],
    subject: parsed.subject?.trim() || "(no subject)",
    ...(parsed.html ? { html: parsed.html } : {}),
    text: parsed.text ?? "",
    headers: { [FORWARDED_HEADER]: "1" },
    attachments: parsed.attachments.map((attachment) => ({
      filename: attachment.filename || "attachment",
      content: toBase64(attachment.content),
      ...(attachment.mimeType ? { content_type: attachment.mimeType } : {}),
      ...(attachment.contentId ? { content_id: attachment.contentId.replace(/^<|>$/g, "") } : {})
    }))
  };
}

async function sendThroughResend(env: Env, payload: ReturnType<typeof resendPayload>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function forwardToFallback(message: ForwardableEmailMessage, env: Env, reason: string) {
  const destinations = recipientList((env.FALLBACK_DESTINATIONS ?? "").split(","), env.LIST_ADDRESS);
  const results = await Promise.allSettled(destinations.map((to) => message.forward(to)));
  if (!results.some((result) => result.status === "fulfilled")) {
    message.setReject(`Could not deliver to ${env.LIST_ADDRESS}: ${reason}`);
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    // Our own copy coming back (a reply-all to the list): everyone already has it.
    if (message.headers.get(FORWARDED_HEADER)) return;
    try {
      const parsed = await PostalMime.parse(await new Response(message.raw).arrayBuffer());
      const recipients = await loadRecipients(env);
      if (recipients.length === 0) throw new Error("no executive producers or super admins in the Portal");
      await sendThroughResend(env, resendPayload(parsed, recipients, env, message.from));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Reasons only: addresses stay out of logs.
      console.error("producers@: sending through Resend failed; forwarding to the fallback list", reason);
      await forwardToFallback(message, env, reason);
    }
  }
};
