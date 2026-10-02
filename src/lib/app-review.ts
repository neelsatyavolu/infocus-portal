/**
 * Apple App Review demo account for the InFocus Portal iPhone app. Env only, never in source:
 * - APP_REVIEW_EMAIL: the account. It is confined to its own sample workspace (middleware),
 *   sees no shared workspaces (workspace-access) and is left out of every people list (prisma).
 * - APP_REVIEW_CODE: 12–32 digits. With it, that email signs in with this fixed code instead
 *   of a mailed one. Without it the account can't sign in at all (its address has no inbox).
 * Edge-safe: middleware imports this file.
 */

export const APP_REVIEW_CODE_PATTERN = /^\d{12,32}$/;

export function appReviewEmail(): string | null {
  return process.env.APP_REVIEW_EMAIL?.trim().toLowerCase() || null;
}

/** The fixed sign-in code, when the account and a well-formed code are both configured. */
export function appReviewCode(): string | null {
  const code = process.env.APP_REVIEW_CODE?.trim() ?? "";
  return appReviewEmail() && APP_REVIEW_CODE_PATTERN.test(code) ? code : null;
}

export function isAppReviewEmail(email?: string | null) {
  const review = appReviewEmail();
  return Boolean(review && email && email.trim().toLowerCase() === review);
}

/** Pages and APIs the account may use: its dashboard, its workspace's projects and media, settings, sign-out. */
const ANY_HOST_PATHS = ["/sign-in", "/access-denied", "/api/auth"];
const MAIN_HOST_PATHS = [
  "/dashboard",
  "/workspaces",
  "/projects",
  "/settings",
  "/onboarding",
  "/maintenance",
  "/api/workspaces",
  // The iPhone app's Home (its own workspaces and projects; no snapshot or package data for this account).
  "/api/app/home",
  "/api/projects",
  "/api/media",
  "/api/comments",
  "/api/guest-links",
  "/api/profile",
  "/api/onboarding",
  "/api/notification-preferences",
  "/api/push"
];

function underAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAppReviewPathAllowed(pathname: string, surface = "main") {
  if (underAny(pathname, ANY_HOST_PATHS)) return true;
  return surface === "main" && (pathname === "/" || underAny(pathname, MAIN_HOST_PATHS));
}
