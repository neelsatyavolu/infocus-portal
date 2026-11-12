import { GUEST_PASSCODE_PROOF_TTL_MS } from "@/src/lib/guest-links";

/** Holds the signed passcode proof (issueGuestCredential) so the passcode never sits in a URL. */
export const GUEST_PROOF_COOKIE = "infocus_guest_proof";

/** Guest tokens are base64url (generateGuestToken); anything else can't be a link. */
export function isGuestTokenShape(token: string) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(token);
}

/** Scoped to this one link's page, host-only, and gone when the proof expires. */
export function guestProofCookieOptions(token: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: `/g/${token}`,
    maxAge: Math.floor(GUEST_PASSCODE_PROOF_TTL_MS / 1000)
  };
}

/** 5 passcode tries per link per address every 15 minutes. */
export const GUEST_PASSCODE_ATTEMPT_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
