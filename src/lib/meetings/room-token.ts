/**
 * Meetings room tokens, shared by the Portal (Node), the meeting-room Worker and the browser.
 * Format matches the Portal session tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Uses WebCrypto only so the same file runs in all three runtimes.
 */

export type MeetingRoomRole = "host" | "member" | "scribe";

/** A participant's ticket into one meeting's room (Worker WebSocket + SFU proxy). */
export type MeetingRoomTokenPayload = {
  v: 1;
  kind: "room";
  /** Meeting id. */
  mid: string;
  /** User id (scribe uses "scribe"). */
  uid: string;
  /** Display name shown on tiles. */
  name: string;
  role: MeetingRoomRole;
  /** Admitted when issued (host, quick access, rejoin, scribe). Waiting tickets are false. */
  adm: boolean;
  /** Executive producer, adviser or super admin: first in line when host is handed over. */
  exec?: boolean;
  /** Issued at, epoch ms. The room rejects tickets issued before a removal. */
  iat: number;
  /** Expires at, epoch ms. */
  exp: number;
};

/** Server-to-server calls between the Portal and the Worker. */
export type MeetingInternalTokenPayload = {
  v: 1;
  kind: "internal";
  /** Which side signed it. */
  from: "portal" | "room";
  /** The meeting this call is about; the receiver checks it against the request path. */
  mid: string;
  iat: number;
  exp: number;
};

export type MeetingTokenPayload = MeetingRoomTokenPayload | MeetingInternalTokenPayload;

export const MEETING_ROOM_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
export const MEETING_INTERNAL_TOKEN_TTL_MS = 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify"
  ]);
}

export async function signMeetingToken(payload: MeetingTokenPayload, secret: string) {
  if (!secret) throw new Error("MEETING_ROOM_SECRET is not configured");
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the payload when the signature is valid and the token has not expired, else null. */
export async function verifyMeetingToken(
  token: string,
  secret: string,
  now = Date.now()
): Promise<MeetingTokenPayload | null> {
  if (!secret || !token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(body)
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as MeetingTokenPayload;
    if (payload?.v !== 1 || typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (payload.kind !== "room" && payload.kind !== "internal") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyMeetingRoomToken(token: string, secret: string, now = Date.now()) {
  const payload = await verifyMeetingToken(token, secret, now);
  return payload?.kind === "room" ? payload : null;
}

/** Valid only when signed by `from` for this exact meeting id. */
export async function verifyMeetingInternalToken(
  token: string,
  secret: string,
  from: MeetingInternalTokenPayload["from"],
  mid: string,
  now = Date.now()
) {
  const payload = await verifyMeetingToken(token, secret, now);
  return payload?.kind === "internal" && payload.from === from && payload.mid === mid ? payload : null;
}

export function signMeetingInternalToken(
  from: MeetingInternalTokenPayload["from"],
  mid: string,
  secret: string,
  now = Date.now()
) {
  return signMeetingToken({ v: 1, kind: "internal", from, mid, iat: now, exp: now + MEETING_INTERNAL_TOKEN_TTL_MS }, secret);
}
