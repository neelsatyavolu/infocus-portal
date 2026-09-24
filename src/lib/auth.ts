import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { WorkspaceRole } from "@prisma/client";
import { APP_SESSION_COOKIE_NAME } from "@/src/lib/auth-cookies";
import { parseAppSessionToken, type SessionUser } from "@/src/lib/auth-edge";
import { resolveSessionCookieDomain } from "@/src/lib/hosts";
import { isEmailAllowedToUsePlatform, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  VIEW_AS_COOKIE_NAME,
  VIEW_AS_MAX_AGE_SECONDS,
  parseViewAsPayload,
  shouldApplyViewAs
} from "@/src/lib/view-as";

export type { SessionUser } from "@/src/lib/auth-edge";
export { parseAppSessionToken } from "@/src/lib/auth-edge";

type GoogleOAuthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  equipmentOrigin?: string;
};

type GoogleOAuthStateTokenPayload = GoogleOAuthState & {
  iat: number;
  exp: number;
  v: 1;
};

const PROFILE_SYNC_TTL_MS = 6 * 60 * 60 * 1000;
const SESSION_REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

function encodeBase64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function decodeBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function getAuthSecret() {
  return process.env.APP_AUTH_SECRET || "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createToken(payload: Record<string, unknown>) {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("APP_AUTH_SECRET is required.");
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token?: string | null): Record<string, unknown> | null {
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

  const expectedSignature = sign(encodedPayload, secret);
  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }

  const isValidSignature = crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
  if (!isValidSignature) {
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

function parseGoogleOAuthStateTokenPayload(payload: Record<string, unknown>): GoogleOAuthStateTokenPayload | null {
  if (
    payload.v !== 1 ||
    typeof payload.state !== "string" ||
    typeof payload.codeVerifier !== "string" ||
    typeof payload.returnTo !== "string" ||
    (payload.equipmentOrigin !== undefined && typeof payload.equipmentOrigin !== "string") ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  return payload as GoogleOAuthStateTokenPayload;
}

async function resolveUserIdForGoogleIdentity(providerUserId: string, email: string | null) {
  const providerScopedId = `google_${providerUserId}`;

  const existingByProviderScopedId = await prisma.user.findUnique({
    where: { id: providerScopedId },
    select: { id: true }
  });

  if (existingByProviderScopedId) {
    return existingByProviderScopedId.id;
  }

  if (email) {
    const existingByEmail = await prisma.user.findFirst({
      where: { email },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });

    if (existingByEmail) {
      return existingByEmail.id;
    }
  }

  return providerScopedId;
}

export function getAppSessionCookieMeta(rememberMe: boolean, hostHeader?: string | null) {
  const domain = resolveSessionCookieDomain(hostHeader);
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: rememberMe ? SESSION_REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {})
  };
}

export function getGoogleOAuthStateCookieMeta(hostHeader?: string | null) {
  const domain = resolveSessionCookieDomain(hostHeader);
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {})
  };
}

export function getViewAsCookieMeta(hostHeader?: string | null) {
  const domain = resolveSessionCookieDomain(hostHeader);
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {})
  };
}

export function createViewAsToken(input: { actorUserId: string; targetUserId: string }) {
  const now = Date.now();
  return createToken({
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    iat: now,
    exp: now + VIEW_AS_MAX_AGE_SECONDS * 1000,
    v: 1
  });
}

export function createAppSessionToken(user: SessionUser, rememberMe: boolean) {
  const now = Date.now();
  const ttlMs = (rememberMe ? SESSION_REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS) * 1000;

  return createToken({
    ...user,
    iat: now,
    exp: now + ttlMs,
    v: 1
  });
}

export function createGoogleOAuthStateToken(state: GoogleOAuthState) {
  const now = Date.now();

  return createToken({
    ...state,
    iat: now,
    exp: now + OAUTH_STATE_MAX_AGE_SECONDS * 1000,
    v: 1
  });
}

export function parseGoogleOAuthStateToken(token?: string | null): GoogleOAuthState | null {
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  const parsedPayload = parseGoogleOAuthStateTokenPayload(payload);
  if (!parsedPayload) {
    return null;
  }

  return {
    state: parsedPayload.state,
    codeVerifier: parsedPayload.codeVerifier,
    returnTo: parsedPayload.returnTo,
    ...(parsedPayload.equipmentOrigin ? { equipmentOrigin: parsedPayload.equipmentOrigin } : {})
  };
}

export function getGoogleOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? ""
  };
}

export function hasGoogleOAuthConfig() {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret && getAuthSecret());
}

export function sanitizeReturnTo(returnTo?: string | null, fallback = "/dashboard") {
  const value = (returnTo ?? "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  if (value.startsWith("/api/") || value === "/sign-in") {
    return fallback;
  }

  return value;
}

// Request-scoped memo (React cache): the layout, page, and access helpers all
// call these in one render, so parse the cookie and hit the database once.
export const getRealSessionUser = cache(async () => {
  const cookieStore = await cookies();
  return await parseAppSessionToken(cookieStore.get(APP_SESSION_COOKIE_NAME)?.value);
});

export const getSessionUser = cache(async () => {
  const real = await getRealSessionUser();
  if (!real) {
    return null;
  }

  const cookieStore = await cookies();
  const token = parseViewAsPayload(verifyToken(cookieStore.get(VIEW_AS_COOKIE_NAME)?.value));
  if (
    !shouldApplyViewAs({
      actorUserId: real.userId,
      actorEmail: real.email,
      token
    }) ||
    !token
  ) {
    return real;
  }

  const target = await prisma.user.findUnique({
    where: { id: token.targetUserId },
    select: { id: true, email: true, name: true, imageUrl: true }
  });
  if (
    !target ||
    !shouldApplyViewAs({
      actorUserId: real.userId,
      actorEmail: real.email,
      token,
      targetEmail: target.email
    })
  ) {
    return real;
  }

  return {
    userId: target.id,
    email: target.email,
    name: target.name,
    imageUrl: target.imageUrl,
    provider: real.provider,
    providerUserId: real.providerUserId
  };
});

export async function provisionGoogleUserSession(params: {
  providerUserId: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
}) {
  const providerUserId = params.providerUserId.trim();
  if (!providerUserId) {
    throw new Error("BAD_REQUEST");
  }

  const email = normalizeEmail(params.email) || null;
  await assertPlatformAccess(email);

  const userId = await resolveUserIdForGoogleIdentity(providerUserId, email);

  const user = await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      name: params.name ?? null,
      imageUrl: params.imageUrl ?? null
    },
    update: {
      email,
      name: params.name ?? null,
      imageUrl: params.imageUrl ?? null
    }
  });

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
    provider: "google" as const,
    providerUserId
  };
}

async function assertPlatformAccess(email?: string | null) {
  const allowed = await isEmailAllowedToUsePlatform(email);

  if (!allowed) {
    throw new Error("FORBIDDEN");
  }
}

export async function requireUserId() {
  const session = await getSessionUser();
  const userId = session?.userId;

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  return userId;
}

export const syncUserProfile = cache(async (userId?: string) => {
  const session = await getSessionUser();

  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  if (userId && userId !== session.userId) {
    throw new Error("UNAUTHORIZED");
  }

  const id = session.userId;

  const existing = await prisma.user.findUnique({
    where: { id }
  });

  if (existing) {
    // A User row whose stored email is already normalized is itself the
    // provisioning record, so the by-email lookup would just find this row.
    const storedEmailIsNormalized =
      Boolean(existing.email) && normalizeEmail(existing.email) === existing.email;
    if (!storedEmailIsNormalized) {
      await assertPlatformAccess(existing.email ?? session.email);
    }
    const recentlySynced = Date.now() - existing.updatedAt.getTime() < PROFILE_SYNC_TTL_MS;
    if (recentlySynced) {
      return existing;
    }

    return prisma.user.update({
      where: { id },
      data: {
        email: session.email,
        name: session.name,
        imageUrl: session.imageUrl
      }
    });
  }

  await assertPlatformAccess(session.email);

  return prisma.user.create({
    data: {
      id,
      email: session.email,
      name: session.name,
      imageUrl: session.imageUrl
    }
  });
});

export async function requireWorkspaceMember(workspaceId: string, allowedRoles?: WorkspaceRole[]) {
  const userId = await requireUserId();
  await syncUserProfile(userId);

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId
      }
    }
  });

  if (!member) {
    throw new Error("FORBIDDEN");
  }

  if (allowedRoles && !allowedRoles.includes(member.role)) {
    throw new Error("FORBIDDEN");
  }

  return {
    member,
    userId
  };
}

export async function requireProjectMember(projectId: string, allowedRoles?: WorkspaceRole[]) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true }
  });

  if (!project) {
    throw new Error("NOT_FOUND");
  }

  const result = await requireWorkspaceMember(project.workspaceId, allowedRoles);
  return {
    ...result,
    project
  };
}
