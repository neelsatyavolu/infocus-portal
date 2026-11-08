import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateGuestToken() {
  return randomBytes(24).toString("base64url");
}

export function hashPasscode(passcode: string) {
  return createHash("sha256").update(passcode).digest("hex");
}

export function verifyPasscode(passcode: string, hash: string) {
  const candidate = hashPasscode(passcode);
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export function isGuestLinkActive(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}) {
  if (link.revokedAt) {
    return false;
  }

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return false;
  }

  return true;
}

/** How long the passcode proof the /g page hands out stays valid. Reloading the page issues a new one. */
export const GUEST_PASSCODE_PROOF_TTL_MS = 8 * 60 * 60 * 1000;

type GuestProofLink = { id: string; token: string; passcodeHash: string };

/** Its own key (derived from the session secret), so a proof can never pass as a session or any other token. */
function guestProofKey() {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret) throw new Error("APP_AUTH_SECRET is required.");
  return createHmac("sha256", secret).update("infocus-guest-passcode-proof/v1").digest();
}

function signGuestProof(link: GuestProofLink, exp: number) {
  return createHmac("sha256", guestProofKey())
    .update(`${link.id}.${link.token}.${link.passcodeHash}.${exp}`)
    .digest("base64url");
}

/**
 * The credential guest requests carry for a passcode link once the passcode was checked:
 * `<token>.<exp>.<sig>`. Tokens are base64url, so they never contain a dot. Changing the
 * passcode invalidates every proof issued under the old one.
 */
export function issueGuestCredential(link: GuestProofLink, now = Date.now()) {
  const exp = now + GUEST_PASSCODE_PROOF_TTL_MS;
  return `${link.token}.${exp}.${signGuestProof(link, exp)}`;
}

/** Splits a guest credential into the link token and the passcode proof, if one is attached. */
export function parseGuestCredential(credential: string) {
  const [token, ...rest] = credential.split(".");
  return { token, proof: rest.length > 0 ? rest.join(".") : null };
}

export function verifyGuestPasscodeProof(proof: string | null, link: GuestProofLink, now = Date.now()) {
  if (!proof) return false;
  const [expText, sig, ...extra] = proof.split(".");
  const exp = Number(expText);
  if (extra.length > 0 || !sig || !/^\d+$/.test(expText) || exp < now) return false;
  const expected = Buffer.from(signGuestProof(link, exp));
  const candidate = Buffer.from(sig);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
