export type SessionUser = {
  userId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  provider: "google" | "email" | "passkey";
  providerUserId: string;
};

type SessionTokenPayload = SessionUser & {
  iat: number;
  exp: number;
  v: 1;
};

function decodeBase64Url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getAuthSecret() {
  return process.env.APP_AUTH_SECRET || "";
}

async function sign(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(signature);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function verifyToken(token?: string | null): Promise<Record<string, unknown> | null> {
  if (!token || typeof token !== "string") {
    return null;
  }

  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }

  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = tokenParts;
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = await sign(encodedPayload, secret);
  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    if (!isRecord(payload) || typeof payload.exp !== "number" || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseSessionTokenPayload(payload: Record<string, unknown>): SessionTokenPayload | null {
  if (
    payload.v !== 1 ||
    typeof payload.userId !== "string" ||
    typeof payload.providerUserId !== "string" ||
    (payload.provider !== "google" && payload.provider !== "email" && payload.provider !== "passkey") ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.email !== null && typeof payload.email !== "string") {
    return null;
  }

  if (payload.name !== null && typeof payload.name !== "string") {
    return null;
  }

  if (payload.imageUrl !== null && typeof payload.imageUrl !== "string") {
    return null;
  }

  return payload as SessionTokenPayload;
}

export async function parseAppSessionToken(token?: string | null): Promise<SessionUser | null> {
  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  const parsedPayload = parseSessionTokenPayload(payload);
  if (!parsedPayload) {
    return null;
  }

  return {
    userId: parsedPayload.userId,
    email: parsedPayload.email,
    name: parsedPayload.name,
    imageUrl: parsedPayload.imageUrl,
    provider: parsedPayload.provider,
    providerUserId: parsedPayload.providerUserId
  };
}
