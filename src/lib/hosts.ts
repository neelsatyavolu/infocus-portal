/**
 * Host / subdomain helpers for multi-app routing on infocuspaly.com.
 *
 * - grades.infocuspaly.com → grades dashboard
 * - teleprompter.infocuspaly.com → teleprompter app
 * - equipment.infocuspaly.com → equipment app
 * - meet.infocuspaly.com → Meetings (/ = the Meetings tab, /producers = the series, /<id> = a call)
 * - infocuspaly.com (and www / vercel preview) → main packages app
 */

export type AppSurface = "main" | "grades" | "teleprompter" | "equipment" | "meet";

export const COOKIE_PARENT_DOMAIN = ".infocuspaly.com";

export function normalizeHost(hostHeader?: string | null): string {
  return (hostHeader ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
}

export function resolveAppSurface(hostHeader?: string | null): AppSurface {
  const host = normalizeHost(hostHeader);

  if (host.startsWith("grades.")) {
    return "grades";
  }

  if (host.startsWith("teleprompter.")) {
    return "teleprompter";
  }

  if (host.startsWith("equipment.")) {
    return "equipment";
  }

  if (host.startsWith("meet.")) {
    return "meet";
  }

  return "main";
}

/** Shared cookie Domain for production *.infocuspaly.com hosts. */
export function resolveSessionCookieDomain(hostHeader?: string | null): string | undefined {
  const host = normalizeHost(hostHeader);
  if (!host) {
    // Fall back to env for non-request contexts
    if (process.env.SESSION_COOKIE_DOMAIN?.trim()) {
      return process.env.SESSION_COOKIE_DOMAIN.trim();
    }
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return COOKIE_PARENT_DOMAIN;
    }
    return undefined;
  }

  if (host === "infocuspaly.com" || host.endsWith(".infocuspaly.com")) {
    return COOKIE_PARENT_DOMAIN;
  }

  // Local / preview: host-only cookie (no Domain attribute)
  return undefined;
}

export function gradesAppOrigin() {
  return process.env.GRADES_APP_URL?.trim() || "https://grades.infocuspaly.com";
}

export function teleprompterAppOrigin() {
  return process.env.TELEPROMPTER_APP_URL?.trim() || "https://teleprompter.infocuspaly.com";
}

export function equipmentAppOrigin() {
  return process.env.EQUIPMENT_APP_URL?.trim() || "https://equipment.infocuspaly.com";
}

export function mainAppOrigin() {
  return process.env.APP_BASE_URL?.trim() || "https://infocuspaly.com";
}

/**
 * The Meetings host. Server env MEET_APP_URL; NEXT_PUBLIC_MEET_APP_URL is the browser's copy
 * (only NEXT_PUBLIC_ values reach client code). Unset: the production host.
 */
export function meetAppOrigin() {
  return (
    process.env.MEET_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEET_APP_URL?.trim() ||
    "https://meet.infocuspaly.com"
  ).replace(/\/+$/, "");
}
