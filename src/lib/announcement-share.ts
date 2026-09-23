import crypto from "node:crypto";

export const SUBMITTED_ANNOUNCEMENT_SHARE_PURPOSE = "submitted-announcements";

export const SHARE_DURATION_OPTIONS = [
  { value: "30d", label: "30 days", ttlSeconds: 30 * 24 * 60 * 60 },
  { value: "1y", label: "1 year", ttlSeconds: 365 * 24 * 60 * 60 }
] as const;

export type ShareDuration = (typeof SHARE_DURATION_OPTIONS)[number]["value"];

export function shareDurationTtlSeconds(duration: ShareDuration) {
  return SHARE_DURATION_OPTIONS.find((option) => option.value === duration)?.ttlSeconds ?? SHARE_DURATION_OPTIONS[0].ttlSeconds;
}

export function shareDurationLabel(duration: ShareDuration) {
  return SHARE_DURATION_OPTIONS.find((option) => option.value === duration)?.label ?? "30 days";
}

type SharePayload = {
  v: 1;
  purpose: typeof SUBMITTED_ANNOUNCEMENT_SHARE_PURPOSE;
  exp: number;
  by: string;
};

function encodeBase64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function decodeBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function getSecret() {
  return process.env.APP_AUTH_SECRET || "";
}

export function createSubmittedAnnouncementShareToken(
  invitedByEmail: string,
  now = Date.now(),
  duration: ShareDuration = "30d"
) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("APP_AUTH_SECRET is required.");
  }

  const payload: SharePayload = {
    v: 1,
    purpose: SUBMITTED_ANNOUNCEMENT_SHARE_PURPOSE,
    exp: Math.floor(now / 1000) + shareDurationTtlSeconds(duration),
    by: invitedByEmail.trim().toLowerCase()
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySubmittedAnnouncementShareToken(token: string | null | undefined, now = Date.now()) {
  const secret = getSecret();
  if (!secret || !token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<SharePayload>;
    if (parsed.v !== 1 || parsed.purpose !== SUBMITTED_ANNOUNCEMENT_SHARE_PURPOSE) {
      return null;
    }
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 <= now) {
      return null;
    }
    if (typeof parsed.by !== "string" || !parsed.by.includes("@")) {
      return null;
    }
    return { invitedBy: parsed.by };
  } catch {
    return null;
  }
}

export function submittedAnnouncementSharePath(token: string) {
  return `/announcements/shared?token=${encodeURIComponent(token)}`;
}
